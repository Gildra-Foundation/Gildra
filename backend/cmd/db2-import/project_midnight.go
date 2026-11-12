package main

import (
	"context"
	"fmt"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Geography uses exact same-build Map provenance. Skill roster review applies
// ONLY to 69587; later builds need independent roster evidence before expansion
// membership is asserted. Unknown entities stay unknown, never excluded.
func projectMidnightMembership(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		var published bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id WHERE v.build_id=$1) OR EXISTS(SELECT 1 FROM catalog_releases WHERE build_id=$1 AND published_at IS NOT NULL)`, ic.BuildID).Scan(&published); err != nil {
			return err
		}
		if published {
			return fmt.Errorf("Midnight membership requires an unpublished candidate build")
		}
		if _, err := tx.Exec(ctx, worldMembershipSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project source-proven expansion membership: %w", err)
		}
		_, err := tx.Exec(ctx, midnightMembershipSQL, ic.BuildID)
		return err
	})
}

const midnightMembershipSQL = `WITH geography AS (
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
 WHERE r.build_id=$1 AND r.locale='en_US' AND r.table_name IN ('AreaTable','JournalInstance')
), branches AS (
 SELECT r.*,b.product_id,x.id expansion_id FROM catalog_db2_rows r
 JOIN game_builds b ON b.id=r.build_id AND b.build_number=69587
 JOIN game_products p ON p.id=b.product_id AND p.slug='wow'
 JOIN catalog_expansions x ON x.product_id=b.product_id AND x.expansion_key='midnight'
 JOIN catalog_source_artifacts a ON a.id=r.source_artifact_id AND a.build_id=r.build_id
 AND a.status='ready' AND a.content_hash IS NOT NULL AND a.byte_size IS NOT NULL
 WHERE r.build_id=$1 AND r.table_name='SkillLine' AND r.locale='en_US'
 AND r.row_id BETWEEN 2906 AND 2918 AND r.payload->>'ExpansionNameSharedStringID'='1121'
), skills AS (
 SELECT product_id,build_id,'profession'::text entity_type,row_id external_id,expansion_id,source_artifact_id,
 jsonb_build_object('rule','reviewed_midnight_skill_roster_69587','skill_line',row_id,'source_url',source_url) evidence FROM branches
 UNION
 SELECT b.product_id,b.build_id,'recipe',(a.payload->>'Spell')::bigint,b.expansion_id,a.source_artifact_id,
 jsonb_build_object('rule','reviewed_midnight_skillup_roster_69587','skill_line',b.row_id,'ability_id',a.row_id,'source_url',a.source_url)
 FROM branches b JOIN catalog_db2_rows a ON a.build_id=b.build_id AND a.table_name='SkillLineAbility' AND a.locale='en_US'
 AND a.payload->>'SkillupSkillLineID'=b.row_id::text
 JOIN catalog_source_artifacts proof ON proof.id=a.source_artifact_id AND proof.build_id=a.build_id
 AND proof.status='ready' AND proof.content_hash IS NOT NULL AND proof.byte_size IS NOT NULL
 WHERE a.payload->>'TradeSkillCategoryID' ~ '^[1-9][0-9]*$' AND a.payload->>'Spell' ~ '^[1-9][0-9]*$'
), proven AS (SELECT * FROM geography UNION SELECT * FROM skills)
 INSERT INTO catalog_entity_expansions(product_id,build_id,entity_type,external_id,expansion_id,
 classification,evidence_kind,evidence_build_id,source_artifact_id,evidence)
 SELECT DISTINCT ON (p.product_id,p.build_id,p.entity_type,p.external_id)
 p.product_id,p.build_id,p.entity_type,p.external_id,p.expansion_id,'confirmed',
 CASE WHEN p.entity_type IN ('profession','recipe') THEN 'curated' ELSE 'db2' END,p.build_id,p.source_artifact_id,p.evidence
 FROM proven p JOIN game_entities e ON e.product_id=p.product_id AND e.entity_type=p.entity_type AND e.external_id=p.external_id
 WHERE EXISTS(SELECT 1 FROM game_entity_versions v WHERE v.entity_id=e.id AND v.build_id=p.build_id)
 ORDER BY p.product_id,p.build_id,p.entity_type,p.external_id,p.source_artifact_id
 ON CONFLICT(product_id,build_id,entity_type,external_id) DO NOTHING
`
