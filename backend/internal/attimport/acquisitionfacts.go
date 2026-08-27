package attimport

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AcquisitionFactReport struct {
	SnapshotID   uuid.UUID
	BuildID      int64
	Acquisitions int64
}

// ProjectAcquisitionFacts preserves ATT provider evidence under a deliberately
// neutral source type. A provider is not classified as a vendor, container, or
// world drop unless a stronger source proves that role.
func (s *Store) ProjectAcquisitionFacts(ctx context.Context, snapshotID uuid.UUID) (AcquisitionFactReport, error) {
	if snapshotID == uuid.Nil {
		return AcquisitionFactReport{}, errors.New("snapshot ID is required")
	}
	var report AcquisitionFactReport
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
		report = AcquisitionFactReport{SnapshotID: snapshotID, BuildID: scope.BuildID}
		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_item_acquisition_sources acquisition
			USING game_entity_versions version
			WHERE acquisition.version_id=version.id AND version.build_id=$1
			  AND acquisition.source_type='community_provider'`, scope.BuildID); err != nil {
			return fmt.Errorf("clear ATT acquisition facts: %w", err)
		}
		command, err := tx.Exec(ctx, `
			WITH evidence AS MATERIALIZED (
				SELECT node.resolved_entity_id AS item_entity_id,reference.id AS context_id,
					reference.target_external_id AS provider_external_id,
					reference.target_type AS provider_type,reference.target_entity_id AS provider_entity_id,
					node.record_key,node.ancestor_path,node.source_artifact_id,artifact.source_url
				FROM catalog_staged_source_references reference
				JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2
				  AND node.node_kind='item' AND node.resolution_status='resolved'
				  AND node.resolved_entity_id IS NOT NULL
				  AND reference.reference_kind='provider'
				  AND reference.target_type IN ('creature','game_object','item')
			)
			INSERT INTO catalog_item_acquisition_sources(
				version_id,source_type,source_id,context_id,source_entity_id,chance_percent,
				source_url,attributes,source_artifact_id)
			SELECT item_version.id,'community_provider',evidence.provider_external_id,evidence.context_id,
				evidence.provider_entity_id,NULL,evidence.source_url,
				jsonb_build_object('provider_type',evidence.provider_type,'record_key',evidence.record_key,
					'ancestor_path',evidence.ancestor_path,'confidence','resolved_community_source'),
				evidence.source_artifact_id
			FROM evidence
			JOIN LATERAL (SELECT version.id FROM game_entity_versions version
				WHERE version.entity_id=evidence.item_entity_id AND version.build_id=$2
				ORDER BY version.revision DESC LIMIT 1) item_version ON true
			ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET
				source_entity_id=EXCLUDED.source_entity_id,chance_percent=EXCLUDED.chance_percent,
				source_url=EXCLUDED.source_url,attributes=EXCLUDED.attributes,
				source_artifact_id=EXCLUDED.source_artifact_id`, snapshotID, scope.BuildID)
		if err != nil {
			return fmt.Errorf("project ATT acquisition facts: %w", err)
		}
		report.Acquisitions = command.RowsAffected()
		return nil
	})
	return report, err
}
