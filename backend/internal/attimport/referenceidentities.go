package attimport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ReferenceIdentityTypeReport makes registry-only identity creation auditable
// without implying that any names, descriptions, media, or gameplay facts were
// discovered.
type ReferenceIdentityTypeReport struct {
	EntityType      string
	IdentityIDs     int64
	CreatedEntities int64
	CreatedVersions int64
	Observations    int64
}

type ReferenceIdentityReport struct {
	SnapshotID      uuid.UUID
	BuildID         int64
	Evidence        int64
	IdentityIDs     int64
	CreatedEntities int64
	CreatedVersions int64
	Observations    int64
	Types           []ReferenceIdentityTypeReport
}

// ProjectReferencedIdentities creates only minimal canonical identities that
// are explicitly referenced by a validated ATT artifact and are missing for
// the snapshot build. It deliberately excludes maps and creatures: maps are
// authoritative DB2 UiMap identities, while creatures have a dedicated
// projector that also creates catalog_creatures rows.
//
// No localization, description, media, role, location, loot, acquisition, or
// publication state is created here. The resulting versions remain
// registry-only candidates until an authoritative enrichment source proves
// more facts.
func (s *Store) ProjectReferencedIdentities(
	ctx context.Context,
	snapshotID uuid.UUID,
) (ReferenceIdentityReport, error) {
	if snapshotID == uuid.Nil {
		return ReferenceIdentityReport{}, errors.New("snapshot ID is required")
	}
	startedAt := time.Now().UTC()
	var report ReferenceIdentityReport
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
			JOIN game_namespaces namespace ON namespace.product_id=build.product_id
				AND namespace.slug='static-us'
			WHERE build.id=$1`, scope.BuildID).Scan(&productID, &namespaceID); err != nil {
			return fmt.Errorf("resolve ATT reference identity product namespace: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_reference_identity_evidence ON COMMIT DROP AS
			SELECT mapping.canonical_entity_type AS entity_type,
				node.node_kind AS source_type,node.external_id,
				artifact.id AS source_artifact_id,artifact.artifact_key,
				artifact.source_url,node.record_key,node.source_line,
				'node:'||node.node_kind AS evidence_kind
			FROM catalog_staged_source_nodes node
			JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
			JOIN catalog_source_entity_type_mappings mapping
				ON mapping.source=node.source AND mapping.source_type=node.node_kind
				AND mapping.disposition='resolve'
			WHERE artifact.snapshot_id=$1 AND node.build_id=$2
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
			  AND artifact.byte_size IS NOT NULL AND node.external_id>0
			  AND mapping.canonical_entity_type IN ('game_object','item','spell','quest','currency')
			UNION ALL
			SELECT mapping.canonical_entity_type,reference.target_type,
				reference.target_external_id,node.source_artifact_id,
				artifact.artifact_key,artifact.source_url,node.record_key,node.source_line,
				'reference:'||reference.reference_kind
			FROM catalog_staged_source_references reference
			JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
			JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
			JOIN catalog_source_entity_type_mappings mapping
				ON mapping.source=node.source AND mapping.source_type=reference.target_type
				AND mapping.disposition='resolve'
			WHERE artifact.snapshot_id=$1 AND node.build_id=$2
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
			  AND artifact.byte_size IS NOT NULL AND reference.target_external_id>0
			  AND mapping.canonical_entity_type IN ('game_object','item','spell','quest','currency')`,
			snapshotID, scope.BuildID); err != nil {
			return fmt.Errorf("stage ATT reference identity evidence: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE INDEX att_reference_identity_evidence_idx
			ON att_reference_identity_evidence(entity_type,external_id,source_artifact_id)`); err != nil {
			return fmt.Errorf("index ATT reference identity evidence: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM att_reference_identity_evidence`).Scan(&report.Evidence); err != nil {
			return fmt.Errorf("count ATT reference identity evidence: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_reference_identities ON COMMIT DROP AS
			WITH grouped AS (
				SELECT entity_type,external_id,min(source_type) AS source_type,
					count(*) AS evidence_count,
					(array_agg(source_artifact_id ORDER BY artifact_key,record_key,source_line))[1]
						AS primary_artifact_id,
					(array_agg(source_url ORDER BY artifact_key,record_key,source_line))[1]
						AS source_url,
					jsonb_agg(DISTINCT evidence_kind ORDER BY evidence_kind) AS evidence_kinds
				FROM att_reference_identity_evidence
				GROUP BY entity_type,external_id
			)
			SELECT grouped.*,existing.id AS existing_entity_id
			FROM grouped
			LEFT JOIN game_entities existing ON existing.product_id=$1
				AND existing.entity_type=grouped.entity_type
				AND existing.external_id=grouped.external_id
			LEFT JOIN game_entity_versions current_version ON current_version.entity_id=existing.id
				AND current_version.build_id=$2
			WHERE current_version.id IS NULL`, productID, scope.BuildID); err != nil {
			return fmt.Errorf("group ATT reference identities: %w", err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM att_reference_identities`).Scan(&report.IdentityIDs); err != nil {
			return fmt.Errorf("count ATT reference identities: %w", err)
		}
		report.SnapshotID, report.BuildID = snapshotID, scope.BuildID

		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM att_reference_identities WHERE existing_entity_id IS NULL`).Scan(
			&report.CreatedEntities,
		); err != nil {
			return fmt.Errorf("count new ATT reference entities: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(
				product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,identity.entity_type,identity.external_id,
				identity.entity_type||'-'||identity.external_id,$3,$3
			FROM att_reference_identities identity
			WHERE identity.existing_entity_id IS NULL
			ON CONFLICT(product_id,entity_type,external_id) DO NOTHING`,
			productID, namespaceID, scope.BuildID); err != nil {
			return fmt.Errorf("create ATT reference entities: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET namespace_id=$2,last_seen_build_id=$3,deleted_at=NULL,updated_at=now()
			FROM att_reference_identities identity
			WHERE entity.product_id=$1 AND entity.entity_type=identity.entity_type
			  AND entity.external_id=identity.external_id`,
			productID, namespaceID, scope.BuildID); err != nil {
			return fmt.Errorf("refresh ATT reference entities: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			ALTER TABLE att_reference_identities ADD COLUMN payload JSONB;
			UPDATE att_reference_identities SET payload=jsonb_build_object(
				'id',external_id,'registry_only',true,'enrichment_status','source_reference',
				'source_type',source_type,'evidence_count',evidence_count,
				'evidence_kinds',evidence_kinds);
			ALTER TABLE att_reference_identities ADD COLUMN content_hash BYTEA;
			UPDATE att_reference_identities
			SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256')`); err != nil {
			return fmt.Errorf("hash ATT reference identities: %w", err)
		}
		versionCommand, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(
				entity_id,build_id,revision,content_hash,payload,source_url,
				snapshot_id,source_artifact_id,source)
			SELECT entity.id,$2,
				COALESCE((SELECT max(old.revision) FROM game_entity_versions old
					WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,
				identity.content_hash,identity.payload,identity.source_url,$3,
				identity.primary_artifact_id,$4
			FROM att_reference_identities identity
			JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=identity.entity_type
				AND entity.external_id=identity.external_id
			WHERE NOT EXISTS (
				SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2)`,
			productID, scope.BuildID, snapshotID, Source)
		if err != nil {
			return fmt.Errorf("create ATT reference versions: %w", err)
		}
		report.CreatedVersions = versionCommand.RowsAffected()

		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE att_reference_identity_versions ON COMMIT DROP AS
			SELECT identity.entity_type,identity.external_id,entity.id AS entity_id,
				version.id AS version_id
			FROM att_reference_identities identity
			JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=identity.entity_type
				AND entity.external_id=identity.external_id
			JOIN game_entity_versions version ON version.entity_id=entity.id
				AND version.build_id=$2 AND version.content_hash=identity.content_hash`,
			productID, scope.BuildID); err != nil {
			return fmt.Errorf("map ATT reference versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_items(version_id)
			SELECT version_id FROM att_reference_identity_versions WHERE entity_type='item'
			ON CONFLICT(version_id) DO NOTHING`); err != nil {
			return fmt.Errorf("create typed ATT reference items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_spells(version_id)
			SELECT version_id FROM att_reference_identity_versions WHERE entity_type='spell'
			ON CONFLICT(version_id) DO NOTHING`); err != nil {
			return fmt.Errorf("create typed ATT reference spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_quest_registry(build_id,quest_id,enrichment_status)
			SELECT $1,external_id,'registry_only'
			FROM att_reference_identity_versions WHERE entity_type='quest'
			ON CONFLICT(build_id,quest_id) DO NOTHING`, scope.BuildID); err != nil {
			return fmt.Errorf("create typed ATT reference quests: %w", err)
		}
		observationCommand, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version.version_id,evidence.source_artifact_id
			FROM att_reference_identity_evidence evidence
			JOIN att_reference_identity_versions version
				ON version.entity_type=evidence.entity_type
				AND version.external_id=evidence.external_id
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`)
		if err != nil {
			return fmt.Errorf("record ATT reference observations: %w", err)
		}
		report.Observations = observationCommand.RowsAffected()
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET latest_version_id=version.version_id,updated_at=now()
			FROM att_reference_identity_versions version
			WHERE entity.id=version.entity_id
			  AND COALESCE((
				SELECT build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds build ON build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id
			  ),0) <= (SELECT build_number FROM game_builds WHERE id=$1)`, scope.BuildID); err != nil {
			return fmt.Errorf("activate ATT reference candidate versions: %w", err)
		}

		rows, err := tx.Query(ctx, `
			SELECT identity.entity_type,count(*) AS identity_ids,
				count(*) FILTER (WHERE identity.existing_entity_id IS NULL) AS created_entities,
				count(version.version_id) AS created_versions,
				COALESCE(sum(observations.observation_count),0) AS observations
			FROM att_reference_identities identity
			LEFT JOIN att_reference_identity_versions version
				ON version.entity_type=identity.entity_type
				AND version.external_id=identity.external_id
			LEFT JOIN LATERAL (
				SELECT count(DISTINCT observation.source_artifact_id) AS observation_count
				FROM catalog_entity_version_artifacts observation
				JOIN att_reference_identity_evidence evidence
					ON evidence.source_artifact_id=observation.source_artifact_id
					AND evidence.entity_type=identity.entity_type
					AND evidence.external_id=identity.external_id
				WHERE observation.version_id=version.version_id
			) observations ON true
			GROUP BY identity.entity_type ORDER BY identity.entity_type`)
		if err != nil {
			return fmt.Errorf("summarize ATT reference identity types: %w", err)
		}
		for rows.Next() {
			var item ReferenceIdentityTypeReport
			if err := rows.Scan(&item.EntityType, &item.IdentityIDs, &item.CreatedEntities,
				&item.CreatedVersions, &item.Observations); err != nil {
				rows.Close()
				return fmt.Errorf("scan ATT reference identity type report: %w", err)
			}
			report.Types = append(report.Types, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return fmt.Errorf("summarize ATT reference identity types: %w", err)
		}
		rows.Close()

		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_fact_projection_runs(
				snapshot_id,build_id,source,projection_key,status,evidence_total,row_count,
				started_at,finished_at,metadata)
			VALUES($1,$2,$3,'att_reference_identity','succeeded',$4,$5,$6,now(),
				jsonb_build_object('identity_ids',$7::bigint,
					'created_entities',$8::bigint,'created_versions',$9::bigint,
					'artifact_observations',$10::bigint,
					'enrichment_status','source_reference',
					'allowed_entity_types',jsonb_build_array(
						'game_object','item','spell','quest','currency')))`,
			snapshotID, scope.BuildID, Source, report.Evidence, report.IdentityIDs,
			startedAt, report.IdentityIDs, report.CreatedEntities,
			report.CreatedVersions, report.Observations); err != nil {
			return fmt.Errorf("record ATT reference identity projection: %w", err)
		}
		return nil
	})
	if err != nil {
		s.recordProjectionFailure(ctx, snapshotID, "att_reference_identity", startedAt, err)
	}
	return report, err
}
