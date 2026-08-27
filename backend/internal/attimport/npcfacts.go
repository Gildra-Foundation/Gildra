package attimport

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type NPCFactReport struct {
	SnapshotID uuid.UUID
	BuildID    int64
	Roles      int64
	Locations  int64
}

// ProjectNPCFacts replaces only ATT-backed quest-giver roles and coordinates.
// The source remains explicit so release policy can keep community data out of
// production until its legal and quality review is approved.
func (s *Store) ProjectNPCFacts(ctx context.Context, snapshotID uuid.UUID) (NPCFactReport, error) {
	if snapshotID == uuid.Nil {
		return NPCFactReport{}, errors.New("snapshot ID is required")
	}
	var report NPCFactReport
	err := pgx.BeginTxFunc(ctx, s.db, pgx.TxOptions{IsoLevel: pgx.RepeatableRead}, func(tx pgx.Tx) error {
		scope, err := validateResolutionScope(ctx, tx, snapshotID, true)
		if err != nil {
			return err
		}
		stored, err := storedResolution(ctx, tx, snapshotID, scope)
		if err != nil {
			return err
		}
		if stored.Nodes.Resolved+stored.Nodes.Unresolved+stored.Nodes.Ambiguous+stored.Nodes.Excluded != stored.Nodes.Total ||
			stored.References.Resolved+stored.References.Unresolved+stored.References.Ambiguous+stored.References.Excluded != stored.References.Total {
			return errors.New("ATT snapshot has pending identity resolutions")
		}
		report = NPCFactReport{SnapshotID: snapshotID, BuildID: scope.BuildID}
		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_npc_roles role
			USING game_entity_versions version
			WHERE role.version_id=version.id AND version.build_id=$1 AND role.source=$2`,
			scope.BuildID, Source); err != nil {
			return fmt.Errorf("clear ATT NPC roles: %w", err)
		}
		roleCommand, err := tx.Exec(ctx, `
			WITH candidates AS MATERIALIZED (
				SELECT reference.target_entity_id AS entity_id,node.external_id AS quest_id,
					node.record_key,node.source_artifact_id
				FROM catalog_staged_source_references reference
				JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2
				  AND reference.reference_kind='quest_giver' AND reference.target_type='creature'
				  AND reference.target_entity_id IS NOT NULL
			), grouped AS MATERIALIZED (
				SELECT entity_id,jsonb_agg(DISTINCT quest_id ORDER BY quest_id)
					FILTER (WHERE quest_id IS NOT NULL) AS quest_ids,
					count(*) AS evidence_count,MIN(record_key) AS example_record_key,
					MIN(source_artifact_id::text)::uuid AS source_artifact_id
				FROM candidates GROUP BY entity_id
			)
			INSERT INTO catalog_npc_roles(version_id,role,source,attributes,source_artifact_id)
			SELECT version.id,'quest_giver',$3,jsonb_build_object(
				'quest_ids',COALESCE(grouped.quest_ids,'[]'::jsonb),
				'evidence_count',grouped.evidence_count,
				'example_record_key',grouped.example_record_key,
				'confidence','resolved_community_source'),grouped.source_artifact_id
			FROM grouped
			JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
				WHERE candidate.entity_id=grouped.entity_id AND candidate.build_id=$2
				ORDER BY candidate.revision DESC LIMIT 1) version ON true
			ON CONFLICT(version_id,role,source) DO UPDATE SET
				attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id`,
			snapshotID, scope.BuildID, Source)
		if err != nil {
			return fmt.Errorf("project ATT quest-giver roles: %w", err)
		}
		report.Roles = roleCommand.RowsAffected()

		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_npc_locations location
			USING game_entity_versions version
			WHERE location.version_id=version.id AND version.build_id=$1 AND location.source=$2`,
			scope.BuildID, Source); err != nil {
			return fmt.Errorf("clear ATT NPC locations: %w", err)
		}
		locationCommand, err := tx.Exec(ctx, `
			WITH entity_evidence AS MATERIALIZED (
				SELECT node.id AS node_id,node.resolved_entity_id AS entity_id,node.record_key,
					node.fields,node.ancestor_path,node.source_artifact_id,'creature_node'::text AS evidence_kind
				FROM catalog_staged_source_nodes node
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2 AND node.node_kind='creature'
				  AND node.resolution_status='resolved' AND node.resolved_entity_id IS NOT NULL
				  AND jsonb_typeof(node.fields->'coords')='object'
				UNION ALL
				SELECT node.id,reference.target_entity_id,node.record_key,node.fields,node.ancestor_path,
					node.source_artifact_id,reference.reference_kind
				FROM catalog_staged_source_references reference
				JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2
				  AND reference.reference_kind IN ('quest_giver','provider')
				  AND reference.target_type='creature' AND reference.target_entity_id IS NOT NULL
				  AND jsonb_typeof(node.fields->'coords')='object'
			), coordinate_rows AS MATERIALIZED (
				SELECT evidence.*,map.key::int AS ui_map_id,point.value,
					point.ordinality::int AS point_ordinal
				FROM entity_evidence evidence
				CROSS JOIN LATERAL jsonb_each(evidence.fields->'coords') map
				CROSS JOIN LATERAL jsonb_array_elements(map.value) WITH ORDINALITY point(value,ordinality)
				WHERE map.key ~ '^[1-9][0-9]*$' AND jsonb_typeof(map.value)='array'
				  AND jsonb_typeof(point.value)='array' AND jsonb_array_length(point.value)>=2
				  AND point.value->>0 ~ '^-?[0-9]+([.][0-9]+)?$'
				  AND point.value->>1 ~ '^-?[0-9]+([.][0-9]+)?$'
			), candidates AS MATERIALIZED (
				SELECT DISTINCT ON (entity_id,ui_map_id,(value->>0)::double precision,(value->>1)::double precision,
					COALESCE(CASE WHEN jsonb_array_length(value)>=3 AND value->>2 ~ '^-?[0-9]+([.][0-9]+)?$'
						THEN (value->>2)::double precision END,0))
					entity_id,ui_map_id,(value->>0)::double precision AS x,(value->>1)::double precision AS y,
					COALESCE(CASE WHEN jsonb_array_length(value)>=3 AND value->>2 ~ '^-?[0-9]+([.][0-9]+)?$'
						THEN (value->>2)::double precision END,0) AS z,
					record_key,source_artifact_id,evidence_kind,ancestor_path,node_id,point_ordinal
				FROM coordinate_rows
				ORDER BY entity_id,ui_map_id,(value->>0)::double precision,(value->>1)::double precision,
					COALESCE(CASE WHEN jsonb_array_length(value)>=3 AND value->>2 ~ '^-?[0-9]+([.][0-9]+)?$'
						THEN (value->>2)::double precision END,0),node_id,point_ordinal
			)
			INSERT INTO catalog_npc_locations(
				version_id,map_id,ui_map_id,x,y,z,difficulty_id,source,attributes,source_artifact_id)
			SELECT version.id,NULL,candidate.ui_map_id,candidate.x,candidate.y,candidate.z,NULL,$3,
				jsonb_build_object('record_key',candidate.record_key,'evidence_kind',candidate.evidence_kind,
					'ancestor_path',candidate.ancestor_path,'confidence','resolved_community_source'),
				candidate.source_artifact_id
			FROM candidates candidate
			JOIN LATERAL (SELECT version.id FROM game_entity_versions version
				WHERE version.entity_id=candidate.entity_id AND version.build_id=$2
				ORDER BY version.revision DESC LIMIT 1) version ON true
			ON CONFLICT(version_id,map_id,ui_map_id,x,y,z,difficulty_id,source) DO UPDATE SET
				attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id`,
			snapshotID, scope.BuildID, Source)
		if err != nil {
			return fmt.Errorf("project ATT NPC locations: %w", err)
		}
		report.Locations = locationCommand.RowsAffected()
		return nil
	})
	return report, err
}
