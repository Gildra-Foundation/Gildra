-- psql -v build_id=92 -f backend/scripts/midnight-membership.sql
-- Default: SELECT only. Set -v apply=true ONLY against an authorized local/import DB.
-- Geographical membership: an area/instance references a proven Midnight Map.
-- This is not a full expansion denominator and does not classify quests/NPCs by location.
\if :{?apply}
\else
\set apply false
\endif
WITH proven AS (
 SELECT b.product_id,r.build_id,
        CASE r.table_name WHEN 'AreaTable' THEN 'area' ELSE 'instance' END entity_type,
        r.row_id external_id,c.expansion_id,r.source_artifact_id,
        jsonb_build_object('rule','midnight_map_reference_v1','table_name',r.table_name,
          'row_id',r.row_id,'field',CASE r.table_name WHEN 'AreaTable' THEN 'ContinentID' ELSE 'MapID' END,
          'map_id',m.row_id,'map_source_artifact_id',m.source_artifact_id,
          'source_url',r.source_url,'map_source_url',m.source_url) evidence
 FROM catalog_db2_rows r
 JOIN game_builds b ON b.id=r.build_id
 JOIN game_products p ON p.id=b.product_id AND p.slug='wow'
 JOIN catalog_db2_rows m ON m.build_id=r.build_id AND m.locale=r.locale AND m.table_name='Map'
   AND m.row_id::text=CASE r.table_name WHEN 'AreaTable' THEN r.payload->>'ContinentID' ELSE r.payload->>'MapID' END
   AND m.payload->>'ExpansionID'='11'
 JOIN catalog_entity_expansions c ON c.product_id=b.product_id AND c.build_id=r.build_id
   AND c.entity_type='map' AND c.external_id=m.row_id AND c.classification='confirmed'
 JOIN catalog_expansions x ON x.id=c.expansion_id AND x.expansion_key='midnight'
 JOIN catalog_source_artifacts a ON a.id=r.source_artifact_id AND a.build_id=r.build_id
   AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL
 JOIN catalog_source_artifacts ma ON ma.id=m.source_artifact_id AND ma.build_id=m.build_id
   AND ma.status='ready' AND ma.content_hash IS NOT NULL AND ma.byte_size IS NOT NULL
 WHERE r.build_id=:build_id AND r.locale='en_US' AND r.table_name IN ('AreaTable','JournalInstance')
)
\if :apply
INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,
 classification,evidence_kind,evidence_build_id,source_artifact_id,evidence)
SELECT product_id,build_id,entity_type,external_id,expansion_id,'confirmed','db2',build_id,source_artifact_id,evidence FROM proven
-- Preserve existing curated and foreign classifications; review conflicts explicitly.
ON CONFLICT(product_id,build_id,entity_type,external_id) DO NOTHING
RETURNING entity_type,external_id,evidence
\else
SELECT * FROM proven ORDER BY entity_type,external_id
\endif
;
