package catalogtaxonomy

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
)

func rebuildWorldLinks(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, projectionSQL(worldLinksSQL), pgx.QueryExecModeSimpleProtocol); err != nil {
		return fmt.Errorf("project world graph: %w", err)
	}
	return nil
}

// No names, display IDs, bounding-box overlap or level guesses establish an
// entity identity. Edges below have explicit foreign keys in the client.
const worldLinksSQL = `
CREATE TEMP TABLE world_raw ON COMMIT DROP AS
 SELECT r.*,b.product_id FROM catalog_db2_rows r JOIN game_builds b ON b.id=r.build_id
 JOIN catalog_source_artifacts a ON a.id=r.source_artifact_id AND a.build_id=r.build_id
 AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL
 WHERE r.build_id IN ({projection_builds}) AND r.locale='en_US'
 AND r.table_name IN ('AreaTable','Map','UiMap','UiMapAssignment','JournalInstance','JournalEncounter','Faction','CurrencyTypes','ItemSparse','QuestObjective','QuestV2CliTask','ParagonReputation');
CREATE INDEX ON world_raw(table_name,build_id,row_id);
ANALYZE world_raw;
CREATE TEMP TABLE world_edges ON COMMIT DROP AS
 SELECT r.build_id,r.product_id,d.source_type,r.row_id source_id,d.target_type,
 (r.payload->>d.field)::bigint target_id,d.relation,
 jsonb_build_object('table',r.table_name,'row_id',r.row_id,'field',d.field,'source_artifact_id',r.source_artifact_id) proof
 FROM world_raw r JOIN (VALUES
 ('AreaTable','area','area','ParentAreaID','belongs_to'),
 ('AreaTable','area','map','ContinentID','belongs_to'),
 ('Map','map','map','ParentMapID','belongs_to'),
 ('UiMap','ui_map','ui_map','ParentUiMapID','belongs_to'),
 ('JournalInstance','instance','map','MapID','belongs_to'),
 ('JournalEncounter','encounter','instance','JournalInstanceID','belongs_to'),
 ('Faction','faction','faction','ParentFactionID','belongs_to'),
 ('Faction','faction','currency','RenownCurrencyID','mentions'),
 ('CurrencyTypes','currency','faction','FactionID','belongs_to'),
 ('ItemSparse','item','faction','MinFactionID','mentions'),
 ('QuestV2CliTask','quest','faction','FiltMinFactionID','mentions'),
 ('QuestV2CliTask','quest','faction','FiltMaxFactionID','mentions')
 ) d(table_name,source_type,target_type,field,relation) ON d.table_name=r.table_name
 WHERE r.payload->>d.field ~ '^[1-9][0-9]*$'
 UNION ALL
 SELECT r.build_id,r.product_id,'ui_map',(r.payload->>'UiMapID')::bigint,d.target_type,
 (r.payload->>d.field)::bigint,'mentions',
 jsonb_build_object('table','UiMapAssignment','row_id',r.row_id,'field',d.field,'source_artifact_id',r.source_artifact_id)
 FROM world_raw r CROSS JOIN (VALUES ('area','AreaID'),('map','MapID')) d(target_type,field)
 WHERE r.table_name='UiMapAssignment' AND r.payload->>'UiMapID' ~ '^[1-9][0-9]*$' AND r.payload->>d.field ~ '^[1-9][0-9]*$'
 UNION ALL
 SELECT r.build_id,r.product_id,'quest',(r.payload->>'QuestID')::bigint,'creature',(r.payload->>'ObjectID')::bigint,'mentions',
 jsonb_build_object('table','QuestObjective','row_id',r.row_id,'objective_type',r.payload->'Type','source_artifact_id',r.source_artifact_id)
 FROM world_raw r WHERE r.table_name='QuestObjective' AND r.payload->>'Type' IN ('0','3','11')
 AND r.payload->>'QuestID' ~ '^[1-9][0-9]*$' AND r.payload->>'ObjectID' ~ '^[1-9][0-9]*$'
 UNION ALL
 SELECT f.build_id,f.product_id,'faction',f.row_id,'quest',(p.payload->>'QuestID')::bigint,'mentions',
 jsonb_build_object('table','ParagonReputation','row_id',p.row_id,'source_artifact_id',p.source_artifact_id,'faction_artifact',f.source_artifact_id,'threshold',p.payload->'LevelThreshold')
 FROM world_raw f JOIN world_raw p ON p.build_id=f.build_id AND p.table_name='ParagonReputation'
 AND p.payload->>'FactionID'=f.payload->>'ParagonFactionID'
 WHERE f.table_name='Faction' AND f.payload->>'ParagonFactionID' ~ '^[1-9][0-9]*$' AND p.payload->>'QuestID' ~ '^[1-9][0-9]*$';
ANALYZE world_edges;
DELETE FROM game_entity_links WHERE build_id IN ({projection_builds}) AND attributes->>'projection'='db2_world';
CREATE TEMP TABLE world_links ON COMMIT DROP AS
 SELECT s.id source_entity_id,t.id target_entity_id,c.build_id,c.relation,
 jsonb_build_object('projection','db2_world','source','db2','evidence',jsonb_agg(DISTINCT c.proof)) attributes
 FROM world_edges c JOIN game_entities s ON s.product_id=c.product_id AND s.entity_type=c.source_type AND s.external_id=c.source_id AND s.deleted_at IS NULL
 JOIN game_entities t ON t.product_id=c.product_id AND t.entity_type=c.target_type AND t.external_id=c.target_id AND t.deleted_at IS NULL
 WHERE s.id<>t.id
 AND EXISTS(SELECT 1 FROM game_entity_versions v WHERE v.entity_id=s.id AND v.build_id=c.build_id)
 AND EXISTS(SELECT 1 FROM game_entity_versions v WHERE v.entity_id=t.id AND v.build_id=c.build_id)
 GROUP BY s.id,t.id,c.build_id,c.relation;
INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
 SELECT source_entity_id,target_entity_id,build_id,relation,attributes FROM world_links ON CONFLICT DO NOTHING;
-- Bind every derived dependency to both participating candidate versions.
INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
 SELECT DISTINCT v.id,(proof->>'source_artifact_id')::uuid FROM world_links l
 CROSS JOIN LATERAL jsonb_array_elements(l.attributes->'evidence') proof
 JOIN game_entity_versions v ON v.build_id=l.build_id AND v.entity_id IN (l.source_entity_id,l.target_entity_id)
 ON CONFLICT DO NOTHING;

-- Preserve manual overrides; ambiguous technical sub-instances go to review.
INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code,source_artifact_id,evidence,rule_version)
 SELECT r.product_id,r.build_id,'map',r.row_id,
 CASE WHEN r.payload->>'MapName_lang' ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]' THEN 'excluded' ELSE 'review' END,
 'technical_or_placeholder_marker',r.source_artifact_id,jsonb_build_object('table','Map','name',r.payload->>'MapName_lang'),'world-map-usability-v1'
 FROM world_raw r WHERE r.table_name='Map' AND
 (r.payload->>'MapName_lang' ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
 OR r.payload->>'MapName_lang' ~* '^(Garrison[[:space:]]+-|.*Scenario[[:space:]]+Shell)')
 AND NOT EXISTS(SELECT 1 FROM catalog_entity_usability_overrides o WHERE o.product_id=r.product_id AND o.build_id=r.build_id AND o.entity_type='map' AND o.external_id=r.row_id AND o.is_active)
 ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
 source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,rule_version=EXCLUDED.rule_version,assessed_at=now()
 WHERE catalog_entity_usability.decision<>'excluded';
DROP TABLE world_links,world_edges,world_raw;
`
