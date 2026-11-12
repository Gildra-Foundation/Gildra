package main

import "slices"

// Preserve explicitly selected partial imports; extend only the foundation list.
func withWorldSourceTables(tables []string) []string {
	if !slices.Equal(tables, splitList(defaultTables)) {
		return tables
	}
	return append(slices.Clone(tables), "ContentTuning", "CurrencyCategory", "ParagonReputation")
}

// All joins are pinned to one build and complete source artifacts. Existing
// confirmed/excluded decisions are retained; only unknown rows are upgraded.
const worldMembershipSQL = `
CREATE TEMP TABLE world_membership_raw ON COMMIT DROP AS
 SELECT r.*,b.product_id FROM catalog_db2_rows r JOIN game_builds b ON b.id=r.build_id
 JOIN game_products p ON p.id=b.product_id AND p.slug='wow'
 JOIN catalog_source_artifacts a ON a.id=r.source_artifact_id AND a.build_id=r.build_id
 AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL
 WHERE r.build_id=$1 AND r.locale='en_US' AND r.table_name IN
 ('Map','AreaTable','UiMapAssignment','JournalInstance','JournalEncounter','ItemSparse','Toy','Faction','TransmogSet','ContentTuning','QuestV2CliTask','CurrencyTypes','CurrencyCategory')
;
CREATE INDEX ON world_membership_raw(table_name,row_id);
ANALYZE world_membership_raw;
CREATE TEMP TABLE world_membership_direct ON COMMIT DROP AS
 SELECT r.product_id,r.build_id,
 CASE r.table_name WHEN 'Map' THEN 'map' WHEN 'ItemSparse' THEN 'item' WHEN 'Faction' THEN 'faction' ELSE 'transmog_set' END entity_type,
 r.row_id external_id,x.id expansion_id,r.source_artifact_id,
 jsonb_build_object('rule','explicit_expansion_field_v1','table',r.table_name,'row_id',r.row_id,
 'field',CASE WHEN r.table_name='Faction' THEN 'Expansion' ELSE 'ExpansionID' END,'source_url',r.source_url) evidence
 FROM world_membership_raw r JOIN catalog_expansions x ON x.product_id=r.product_id
 AND x.external_expansion_id::text=CASE WHEN r.table_name='Faction' THEN r.payload->>'Expansion' ELSE r.payload->>'ExpansionID' END
 WHERE r.table_name IN ('Map','ItemSparse','Faction','TransmogSet')
;
CREATE INDEX ON world_membership_direct(entity_type,external_id);
ANALYZE world_membership_direct;
WITH geography AS (
 SELECT r.product_id,r.build_id,CASE r.table_name WHEN 'AreaTable' THEN 'area' ELSE 'instance' END entity_type,
 r.row_id external_id,m.expansion_id,r.source_artifact_id,
 jsonb_build_object('rule','explicit_map_reference_v1','table',r.table_name,'map_id',m.external_id,
 'map_artifact',m.source_artifact_id,'source_url',r.source_url) evidence
 FROM world_membership_raw r JOIN world_membership_direct m ON m.entity_type='map'
 AND m.external_id::text=CASE r.table_name WHEN 'AreaTable' THEN r.payload->>'ContinentID' ELSE r.payload->>'MapID' END
 WHERE r.table_name IN ('AreaTable','JournalInstance')
), inherited AS (
 SELECT r.product_id,r.build_id,'toy'::text entity_type,r.row_id external_id,i.expansion_id,r.source_artifact_id,
 jsonb_build_object('rule','toy_item_expansion_v1','item_id',i.external_id,'item_artifact',i.source_artifact_id,'source_url',r.source_url) evidence
 FROM world_membership_raw r JOIN world_membership_direct i ON i.entity_type='item' AND i.external_id::text=r.payload->>'ItemID' WHERE r.table_name='Toy'
 UNION ALL
 SELECT r.product_id,r.build_id,'encounter',r.row_id,g.expansion_id,r.source_artifact_id,
 jsonb_build_object('rule','encounter_instance_map_v1','instance_id',g.external_id,'instance_artifact',g.source_artifact_id,'map_evidence',g.evidence,'source_url',r.source_url)
 FROM world_membership_raw r JOIN geography g ON g.entity_type='instance' AND g.external_id::text=r.payload->>'JournalInstanceID' WHERE r.table_name='JournalEncounter'
), supplemental AS (
 SELECT r.product_id,r.build_id,'quest'::text entity_type,r.row_id external_id,x.id expansion_id,r.source_artifact_id,
 jsonb_build_object('rule','quest_content_tuning_expansion_v1','tuning_id',t.row_id,'tuning_artifact',t.source_artifact_id,'source_url',r.source_url) evidence
 FROM world_membership_raw r JOIN world_membership_raw t ON t.table_name='ContentTuning' AND t.row_id::text=r.payload->>'ContentTuningID'
 JOIN catalog_expansions x ON x.product_id=r.product_id AND x.external_expansion_id::text=t.payload->>'ExpansionID'
 WHERE r.table_name='QuestV2CliTask'
 UNION ALL
 SELECT r.product_id,r.build_id,'currency',r.row_id,x.id,r.source_artifact_id,
 jsonb_build_object('rule','currency_category_expansion_v1','category_id',c.row_id,'category_artifact',c.source_artifact_id,'source_url',r.source_url)
 FROM world_membership_raw r JOIN world_membership_raw c ON c.table_name='CurrencyCategory' AND c.row_id::text=r.payload->>'CategoryID'
 JOIN catalog_expansions x ON x.product_id=r.product_id AND x.external_expansion_id::text=c.payload->>'ExpansionID'
 WHERE r.table_name='CurrencyTypes' AND (c.payload->>'ExpansionID')::int>0
 -- Category ExpansionID=0 includes Miscellaneous/PvP/Hidden, not proof of Classic origin.
 UNION ALL
 SELECT r.product_id,r.build_id,'ui_map',(r.payload->>'UiMapID')::bigint,min(m.expansion_id),
 (array_agg(r.source_artifact_id ORDER BY r.row_id))[1],
 jsonb_build_object('rule','unambiguous_ui_map_assignments_v1','assignments',jsonb_agg(jsonb_build_object('id',r.row_id,'artifact',r.source_artifact_id,'map_evidence',m.evidence)))
 FROM world_membership_raw r LEFT JOIN world_membership_direct m ON m.entity_type='map' AND m.external_id::text=r.payload->>'MapID'
 WHERE r.table_name='UiMapAssignment' AND r.payload->>'UiMapID' ~ '^[1-9][0-9]*$'
 GROUP BY r.product_id,r.build_id,r.payload->>'UiMapID'
 HAVING count(*)=count(m.expansion_id) AND count(DISTINCT m.expansion_id)=1
), proven AS (SELECT * FROM world_membership_direct UNION ALL SELECT * FROM geography UNION ALL SELECT * FROM inherited UNION ALL SELECT * FROM supplemental)
INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,classification,evidence_kind,evidence_build_id,source_artifact_id,evidence)
 SELECT p.product_id,p.build_id,p.entity_type,p.external_id,p.expansion_id,'confirmed','db2',p.build_id,p.source_artifact_id,p.evidence
 FROM proven p JOIN game_entities e ON e.product_id=p.product_id AND e.entity_type=p.entity_type AND e.external_id=p.external_id
 WHERE EXISTS(SELECT 1 FROM game_entity_versions v WHERE v.entity_id=e.id AND v.build_id=p.build_id)
 ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET expansion_id=EXCLUDED.expansion_id,
 classification=EXCLUDED.classification,evidence_kind=EXCLUDED.evidence_kind,evidence_build_id=EXCLUDED.evidence_build_id,
 source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,updated_at=now()
 WHERE catalog_entity_expansions.classification='unclassified';
DROP TABLE world_membership_direct,world_membership_raw;
`
