package attimport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// LootFactReport distinguishes source evidence from projected facts. Missing
// canonical identities remain visible to operators instead of being silently
// discarded or guessed.
type LootFactReport struct {
	SnapshotID        uuid.UUID
	BuildID           int64
	Evidence          int64
	Tables            int64
	Entries           int64
	OwnerUnresolved   int64
	ItemSourceMissing int64
	EvidenceNotUsable int64
}

// ProjectLootFacts projects only ATT item `crs` references. In ATT those are
// explicit creature associations on the item record. Provider references are
// deliberately excluded because they do not prove whether the creature is a
// loot source, vendor, or another acquisition context.
//
// ATT does not state drop chance or stack quantity for these references. Both
// therefore remain NULL with an `unknown` basis in the canonical loot graph.
func (s *Store) ProjectLootFacts(ctx context.Context, snapshotID uuid.UUID) (LootFactReport, error) {
	if snapshotID == uuid.Nil {
		return LootFactReport{}, errors.New("snapshot ID is required")
	}
	var report LootFactReport
	startedAt := time.Now().UTC()
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

		report = LootFactReport{SnapshotID: snapshotID, BuildID: scope.BuildID}
		if err := tx.QueryRow(ctx, `
			SELECT count(*),
				count(*) FILTER (WHERE reference.resolution_status<>'resolved'
					OR reference.target_entity_id IS NULL),
				count(*) FILTER (WHERE reference.resolution_status='resolved'
					AND reference.target_entity_id IS NOT NULL
					AND node.resolution_status='unresolved'),
				count(*) FILTER (WHERE reference.resolution_status='resolved'
					AND reference.target_entity_id IS NOT NULL
					AND node.resolution_status NOT IN ('resolved','unresolved'))
			FROM catalog_staged_source_references reference
			JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
			JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
			WHERE artifact.snapshot_id=$1 AND node.build_id=$2
			  AND node.node_kind='item' AND node.external_id>0
			  AND reference.reference_kind='creature' AND reference.target_type='creature'`,
			snapshotID, scope.BuildID).Scan(
			&report.Evidence, &report.OwnerUnresolved, &report.ItemSourceMissing,
			&report.EvidenceNotUsable,
		); err != nil {
			return fmt.Errorf("count ATT loot evidence: %w", err)
		}

		// A re-run replaces only this projector's rows for the same build. Other
		// source-backed loot tables and other builds are never touched.
		if _, err := tx.Exec(ctx, `
			DELETE FROM catalog_loot_tables loot
			USING game_entity_versions owner
			WHERE loot.owner_version_id=owner.id AND owner.build_id=$1
			  AND loot.attributes->>'projection'='att_crs'`, scope.BuildID); err != nil {
			return fmt.Errorf("clear ATT loot facts: %w", err)
		}

		tableCommand, err := tx.Exec(ctx, `
			WITH evidence AS MATERIALIZED (
				SELECT DISTINCT reference.target_entity_id AS owner_entity_id,
					node.source_artifact_id
				FROM catalog_staged_source_references reference
				JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2
				  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
				  AND artifact.byte_size IS NOT NULL
				  AND node.node_kind='item' AND node.external_id>0
				  AND node.resolution_status IN ('resolved','unresolved')
				  AND reference.reference_kind='creature' AND reference.target_type='creature'
				  AND reference.resolution_status='resolved'
				  AND reference.target_entity_id IS NOT NULL
			), owners AS MATERIALIZED (
				SELECT evidence.source_artifact_id,owner_version.id AS owner_version_id
				FROM evidence
				JOIN LATERAL (
					SELECT version.id
					FROM game_entity_versions version
					JOIN catalog_creatures creature ON creature.version_id=version.id
					WHERE version.entity_id=evidence.owner_entity_id AND version.build_id=$2
					ORDER BY version.revision DESC LIMIT 1
				) owner_version ON true
			)
			INSERT INTO catalog_loot_tables(
				owner_version_id,table_kind,external_id,difficulty_id,
				source_artifact_id,attributes)
			SELECT owner_version_id,'creature',0,0,source_artifact_id,
				jsonb_build_object('projection','att_crs','source',$3::text,
					'confidence','explicit_source_reference','quantity_status','unknown',
					'chance_status','unknown')
			FROM owners
			ON CONFLICT(owner_version_id,table_kind,external_id,difficulty_id,source_artifact_id)
			DO UPDATE SET attributes=EXCLUDED.attributes,observed_at=now()`,
			snapshotID, scope.BuildID, Source)
		if err != nil {
			return fmt.Errorf("project ATT loot tables: %w", err)
		}
		report.Tables = tableCommand.RowsAffected()

		entryCommand, err := tx.Exec(ctx, `
			WITH evidence AS MATERIALIZED (
				SELECT reference.target_entity_id AS owner_entity_id,
					node.external_id AS item_external_id,
					CASE WHEN node.resolution_status='resolved' THEN node.resolved_entity_id END AS item_entity_id,
					CASE WHEN node.resolution_status='resolved' THEN 'resolved' ELSE 'source_missing' END AS item_resolution_status,
					node.record_key,node.source_line,node.ancestor_path,node.source_artifact_id
				FROM catalog_staged_source_references reference
				JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
				JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
				WHERE artifact.snapshot_id=$1 AND node.build_id=$2
				  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
				  AND artifact.byte_size IS NOT NULL
				  AND node.node_kind='item' AND node.external_id>0
				  AND node.resolution_status IN ('resolved','unresolved')
				  AND reference.reference_kind='creature' AND reference.target_type='creature'
				  AND reference.resolution_status='resolved'
				  AND reference.target_entity_id IS NOT NULL
			), grouped AS MATERIALIZED (
				SELECT owner_entity_id,item_external_id,item_entity_id,item_resolution_status,
					source_artifact_id,count(*) AS evidence_count,
					jsonb_agg(jsonb_build_object('record_key',record_key,'source_line',source_line,
						'ancestor_path',ancestor_path) ORDER BY record_key,source_line) AS evidence
				FROM evidence
				GROUP BY owner_entity_id,item_external_id,item_entity_id,item_resolution_status,source_artifact_id
			), numbered AS MATERIALIZED (
				SELECT loot.id AS loot_table_id,grouped.*,
					(row_number() OVER (PARTITION BY loot.id ORDER BY grouped.item_external_id)-1)::int AS entry_index
				FROM grouped
				JOIN LATERAL (
					SELECT version.id
					FROM game_entity_versions version
					JOIN catalog_creatures creature ON creature.version_id=version.id
					WHERE version.entity_id=grouped.owner_entity_id AND version.build_id=$2
					ORDER BY version.revision DESC LIMIT 1
				) owner_version ON true
				JOIN catalog_loot_tables loot
				  ON loot.owner_version_id=owner_version.id
				 AND loot.table_kind='creature' AND loot.external_id=0 AND loot.difficulty_id=0
				 AND loot.source_artifact_id=grouped.source_artifact_id
				 AND loot.attributes->>'projection'='att_crs'
			)
			INSERT INTO catalog_loot_entries(
				loot_table_id,entry_index,item_external_id,item_entity_id,resolution_status,
				min_quantity,max_quantity,quantity_basis,chance_percent,chance_basis,
				source_artifact_id,attributes)
			SELECT loot_table_id,entry_index,item_external_id,item_entity_id,item_resolution_status,
				NULL,NULL,'unknown',NULL,'unknown',source_artifact_id,
				jsonb_build_object('projection','att_crs','source',$3::text,
					'confidence','explicit_source_reference','evidence_count',evidence_count,
					'evidence',evidence)
			FROM numbered
			ORDER BY loot_table_id,entry_index`, snapshotID, scope.BuildID, Source)
		if err != nil {
			return fmt.Errorf("project ATT loot entries: %w", err)
		}
		report.Entries = entryCommand.RowsAffected()
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_fact_projection_runs(
				snapshot_id,build_id,source,projection_key,status,evidence_total,
				table_count,row_count,owner_unresolved,entity_source_missing,
				evidence_not_usable,started_at,finished_at,metadata)
			VALUES($1,$2,$3,'att_loot','succeeded',$4,$5,$6,$7,$8,$9,$10,now(),
				jsonb_build_object('reference_kind','creature','source_field','crs',
					'quantity_basis','unknown','chance_basis','unknown'))`,
			snapshotID, scope.BuildID, Source, report.Evidence, report.Tables,
			report.Entries, report.OwnerUnresolved, report.ItemSourceMissing,
			report.EvidenceNotUsable, startedAt); err != nil {
			return fmt.Errorf("record ATT loot projection: %w", err)
		}
		return nil
	})
	if err != nil {
		s.recordProjectionFailure(ctx, snapshotID, "att_loot", startedAt, err)
	}
	return report, err
}
