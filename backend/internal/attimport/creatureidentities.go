package attimport

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CreatureIdentityReport struct {
	SnapshotID      uuid.UUID
	BuildID         int64
	Evidence        int64
	CreatureIDs     int64
	CreatedEntities int64
	CreatedVersions int64
	Observations    int64
}

// ProjectCreatureIdentities creates minimal, source-backed creature identities
// for explicit ATT creature nodes and references. It never invents a name,
// role, location, display, or drop fact. Enrichment can attach those facts to
// the same product-scoped external ID later.
func (s *Store) ProjectCreatureIdentities(ctx context.Context, snapshotID uuid.UUID) (CreatureIdentityReport, error) {
	if snapshotID == uuid.Nil {
		return CreatureIdentityReport{}, errors.New("snapshot ID is required")
	}
	startedAt := time.Now().UTC()
	var report CreatureIdentityReport
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

		var productID, namespaceID int64
		if err := tx.QueryRow(ctx, `
			SELECT build.product_id,namespace.id
			FROM game_builds build
			JOIN LATERAL (
				SELECT candidate.id FROM game_namespaces candidate
				WHERE candidate.product_id=build.product_id AND candidate.kind='static'
				ORDER BY (candidate.region='us') DESC,candidate.id LIMIT 1
			) namespace ON true
			WHERE build.id=$1`, scope.BuildID).Scan(&productID, &namespaceID); err != nil {
			return fmt.Errorf("resolve ATT creature product namespace: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_creature_identity_evidence ON COMMIT DROP AS
			SELECT node.external_id,artifact.id AS source_artifact_id,artifact.artifact_key,
				artifact.source_url,node.record_key,node.source_line,'creature_node'::text AS evidence_kind
			FROM catalog_staged_source_nodes node
			JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
			WHERE artifact.snapshot_id=$1 AND node.build_id=$2
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
			  AND artifact.byte_size IS NOT NULL
			  AND node.node_kind='creature' AND node.external_id>0
			UNION ALL
			SELECT reference.target_external_id,node.source_artifact_id,artifact.artifact_key,
				artifact.source_url,node.record_key,node.source_line,reference.reference_kind
			FROM catalog_staged_source_references reference
			JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
			JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
			WHERE artifact.snapshot_id=$1 AND node.build_id=$2
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
			  AND artifact.byte_size IS NOT NULL
			  AND reference.target_type='creature' AND reference.target_external_id>0`,
			snapshotID, scope.BuildID); err != nil {
			return fmt.Errorf("stage ATT creature identity evidence: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE INDEX att_creature_identity_evidence_id_idx
			ON att_creature_identity_evidence(external_id,source_artifact_id)`); err != nil {
			return fmt.Errorf("index ATT creature identity evidence: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM att_creature_identity_evidence`).Scan(
			&report.Evidence,
		); err != nil {
			return fmt.Errorf("count ATT creature identity evidence: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_creature_identities ON COMMIT DROP AS
			WITH grouped AS (
				SELECT external_id,count(*) AS evidence_count,
				(array_agg(source_artifact_id ORDER BY artifact_key,record_key,source_line))[1] AS primary_artifact_id,
				(array_agg(source_url ORDER BY artifact_key,record_key,source_line))[1] AS source_url,
				jsonb_agg(DISTINCT evidence_kind ORDER BY evidence_kind) AS evidence_kinds
				FROM att_creature_identity_evidence GROUP BY external_id
			)
			SELECT grouped.*
			FROM grouped
			LEFT JOIN game_entities existing ON existing.product_id=$1
				AND existing.entity_type='creature' AND existing.external_id=grouped.external_id
			LEFT JOIN game_entity_versions current_version ON current_version.entity_id=existing.id
				AND current_version.build_id=$2
			WHERE existing.id IS NULL OR current_version.id IS NULL`, productID, scope.BuildID); err != nil {
			return fmt.Errorf("group ATT creature identities: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM att_creature_identities`).Scan(
			&report.CreatureIDs,
		); err != nil {
			return fmt.Errorf("count ATT creature identities: %w", err)
		}
		report.SnapshotID, report.BuildID = snapshotID, scope.BuildID

		entityCommand, err := tx.Exec(ctx, `
			INSERT INTO game_entities(
				product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'creature',identity.external_id,'creature-'||identity.external_id,$3,$3
			FROM att_creature_identities identity
			LEFT JOIN game_entities existing ON existing.product_id=$1
				AND existing.entity_type='creature' AND existing.external_id=identity.external_id
			WHERE existing.id IS NULL`, productID, namespaceID, scope.BuildID)
		if err != nil {
			return fmt.Errorf("create ATT creature entities: %w", err)
		}
		report.CreatedEntities = entityCommand.RowsAffected()
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET namespace_id=$2,last_seen_build_id=$3,deleted_at=NULL,updated_at=now()
			FROM att_creature_identities identity
			WHERE entity.product_id=$1 AND entity.entity_type='creature'
			  AND entity.external_id=identity.external_id`, productID, namespaceID, scope.BuildID); err != nil {
			return fmt.Errorf("refresh ATT creature entities: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			ALTER TABLE att_creature_identities ADD COLUMN payload JSONB;
			UPDATE att_creature_identities SET payload=jsonb_build_object(
				'id',external_id,'registry_only',true,'enrichment_status','source_reference',
				'evidence_count',evidence_count,'evidence_kinds',evidence_kinds);
			ALTER TABLE att_creature_identities ADD COLUMN content_hash BYTEA;
			UPDATE att_creature_identities
			SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256')`); err != nil {
			return fmt.Errorf("hash ATT creature identities: %w", err)
		}
		versionCommand, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(
				entity_id,build_id,revision,content_hash,payload,source_url,
				snapshot_id,source_artifact_id,source)
			SELECT entity.id,$2,
				COALESCE((SELECT max(old.revision) FROM game_entity_versions old
					WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,
				identity.content_hash,identity.payload,identity.source_url,$3,identity.primary_artifact_id,$4
			FROM att_creature_identities identity
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='creature'
				AND entity.external_id=identity.external_id
			WHERE NOT EXISTS (
				SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2
				  AND old.content_hash=identity.content_hash)`,
			productID, scope.BuildID, snapshotID, Source)
		if err != nil {
			return fmt.Errorf("create ATT creature versions: %w", err)
		}
		report.CreatedVersions = versionCommand.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_creature_identity_versions ON COMMIT DROP AS
			SELECT identity.external_id,entity.id AS entity_id,version.id AS version_id
			FROM att_creature_identities identity
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='creature'
				AND entity.external_id=identity.external_id
			JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$2
				AND version.content_hash=identity.content_hash`, productID, scope.BuildID); err != nil {
			return fmt.Errorf("map ATT creature versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_creatures(version_id)
			SELECT version_id FROM att_creature_identity_versions
			ON CONFLICT(version_id) DO NOTHING`); err != nil {
			return fmt.Errorf("create ATT creature details: %w", err)
		}
		observationCommand, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version.version_id,evidence.source_artifact_id
			FROM att_creature_identity_evidence evidence
			JOIN att_creature_identity_versions version ON version.external_id=evidence.external_id
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`)
		if err != nil {
			return fmt.Errorf("record ATT creature observations: %w", err)
		}
		report.Observations = observationCommand.RowsAffected()
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity SET latest_version_id=version.version_id,updated_at=now()
			FROM att_creature_identity_versions version WHERE entity.id=version.entity_id`); err != nil {
			return fmt.Errorf("activate ATT creature candidate versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_fact_projection_runs(
				snapshot_id,build_id,source,projection_key,status,evidence_total,row_count,
				started_at,finished_at,metadata)
			VALUES($1,$2,$3,'att_creature_identity','succeeded',$4,$5,$6,now(),
				jsonb_build_object('creature_ids',$7::bigint,'created_entities',$8::bigint,
					'created_versions',$9::bigint,'artifact_observations',$10::bigint,
					'enrichment_status','source_reference'))`,
			snapshotID, scope.BuildID, Source, report.Evidence, report.CreatureIDs,
			startedAt, report.CreatureIDs, report.CreatedEntities,
			report.CreatedVersions, report.Observations); err != nil {
			return fmt.Errorf("record ATT creature identity projection: %w", err)
		}
		return nil
	})
	if err != nil {
		s.recordProjectionFailure(ctx, snapshotID, "att_creature_identity", startedAt, err)
	}
	return report, err
}

func (s *Store) recordProjectionFailure(
	ctx context.Context,
	snapshotID uuid.UUID,
	projectionKey string,
	startedAt time.Time,
	projectionErr error,
) {
	logContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	errorSummary := strings.TrimSpace(projectionErr.Error())
	if len(errorSummary) > 1000 {
		errorSummary = errorSummary[:1000]
	}
	_, _ = s.db.Exec(logContext, `
		INSERT INTO catalog_fact_projection_runs(
			snapshot_id,build_id,source,projection_key,status,error_summary,started_at,finished_at)
		SELECT id,build_id,source,$2,'failed',$3,$4,now()
		FROM catalog_snapshots WHERE id=$1 AND source=$5`,
		snapshotID, projectionKey, errorSummary, startedAt, Source)
}
