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

const Source = "all_the_things"

type ResolutionCounts struct {
	Total      int64
	Resolved   int64
	Unresolved int64
	Ambiguous  int64
	Excluded   int64
}

type ResolutionReport struct {
	SnapshotID uuid.UUID
	BuildID    int64
	Source     string
	Nodes      ResolutionCounts
	References ResolutionCounts
}

type snapshotScope struct {
	BuildID int64
	Source  string
}

// PreviewSnapshot classifies a validated ATT snapshot in a repeatable,
// read-only transaction. It never changes staged rows or publication state.
func (s *Store) PreviewSnapshot(ctx context.Context, snapshotID uuid.UUID) (ResolutionReport, error) {
	if snapshotID == uuid.Nil {
		return ResolutionReport{}, errors.New("snapshot ID is required")
	}
	var report ResolutionReport
	err := pgx.BeginTxFunc(ctx, s.db, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	}, func(tx pgx.Tx) error {
		scope, err := validateResolutionScope(ctx, tx, snapshotID, false)
		if err != nil {
			return err
		}
		report, err = previewResolution(ctx, tx, snapshotID, scope)
		return err
	})
	return report, err
}

// ResolveSnapshot atomically resolves staged ATT identities against canonical
// entities proven for the same product and build. It does not create entities,
// public relationships, releases, or active builds.
func (s *Store) ResolveSnapshot(ctx context.Context, snapshotID uuid.UUID) (ResolutionReport, error) {
	return s.resolveSnapshot(ctx, snapshotID, nil)
}

// ResolveSnapshotIfMatches refuses to write when the classification changed
// after an operator reviewed the preview.
func (s *Store) ResolveSnapshotIfMatches(
	ctx context.Context,
	snapshotID uuid.UUID,
	expected ResolutionReport,
) (ResolutionReport, error) {
	return s.resolveSnapshot(ctx, snapshotID, &expected)
}

func (s *Store) resolveSnapshot(
	ctx context.Context,
	snapshotID uuid.UUID,
	expected *ResolutionReport,
) (ResolutionReport, error) {
	if snapshotID == uuid.Nil {
		return ResolutionReport{}, errors.New("snapshot ID is required")
	}
	var report ResolutionReport
	err := pgx.BeginTxFunc(ctx, s.db, pgx.TxOptions{IsoLevel: pgx.RepeatableRead}, func(tx pgx.Tx) error {
		scope, err := validateResolutionScope(ctx, tx, snapshotID, true)
		if err != nil {
			return err
		}
		if expected != nil {
			current, err := previewResolution(ctx, tx, snapshotID, scope)
			if err != nil {
				return err
			}
			if current != *expected {
				return errors.New("ATT resolution preview changed; run preview again")
			}
		}
		if _, err := tx.Exec(ctx, resolveNodesSQL, snapshotID); err != nil {
			return fmt.Errorf("resolve ATT source nodes: %w", err)
		}
		if _, err := tx.Exec(ctx, resolveReferencesSQL, snapshotID); err != nil {
			return fmt.Errorf("resolve ATT source references: %w", err)
		}
		report, err = storedResolution(ctx, tx, snapshotID, scope)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_source_resolution_runs (
				snapshot_id,build_id,source,status,
				node_total,node_resolved,node_unresolved,node_ambiguous,node_excluded,
				reference_total,reference_resolved,reference_unresolved,reference_ambiguous,reference_excluded
			) VALUES ($1,$2,$3,'succeeded',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			snapshotID, scope.BuildID, scope.Source,
			report.Nodes.Total, report.Nodes.Resolved, report.Nodes.Unresolved,
			report.Nodes.Ambiguous, report.Nodes.Excluded,
			report.References.Total, report.References.Resolved, report.References.Unresolved,
			report.References.Ambiguous, report.References.Excluded,
		); err != nil {
			return fmt.Errorf("record ATT resolution run: %w", err)
		}
		return nil
	})
	if err != nil {
		s.recordResolutionFailure(ctx, snapshotID, err)
	}
	return report, err
}

func validateResolutionScope(
	ctx context.Context,
	tx pgx.Tx,
	snapshotID uuid.UUID,
	lock bool,
) (snapshotScope, error) {
	query := `SELECT build_id,source,status FROM catalog_snapshots WHERE id=$1`
	if lock {
		query += ` FOR UPDATE`
	}
	var scope snapshotScope
	var status string
	if err := tx.QueryRow(ctx, query, snapshotID).Scan(&scope.BuildID, &scope.Source, &status); err != nil {
		return snapshotScope{}, fmt.Errorf("find ATT snapshot: %w", err)
	}
	if scope.Source != Source {
		return snapshotScope{}, fmt.Errorf("snapshot source is %q, expected %q", scope.Source, Source)
	}
	if status != "validated" {
		return snapshotScope{}, fmt.Errorf("ATT snapshot status is %q, expected validated", status)
	}
	var artifactTotal, artifactInvalid, nodeTotal, nodeInconsistent int64
	if err := tx.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (
			WHERE source<>$2 OR build_id<>$3 OR status<>'ready'
			   OR content_hash IS NULL OR byte_size IS NULL
		)
		FROM catalog_source_artifacts WHERE snapshot_id=$1`,
		snapshotID, scope.Source, scope.BuildID).Scan(&artifactTotal, &artifactInvalid); err != nil {
		return snapshotScope{}, fmt.Errorf("validate ATT source artifacts: %w", err)
	}
	if artifactTotal == 0 || artifactInvalid != 0 {
		return snapshotScope{}, fmt.Errorf("ATT source artifacts are incomplete: total=%d invalid=%d", artifactTotal, artifactInvalid)
	}
	if err := tx.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (WHERE node.source<>$2 OR node.build_id<>$3)
		FROM catalog_staged_source_nodes node
		JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
		WHERE artifact.snapshot_id=$1`,
		snapshotID, scope.Source, scope.BuildID).Scan(&nodeTotal, &nodeInconsistent); err != nil {
		return snapshotScope{}, fmt.Errorf("validate ATT staged nodes: %w", err)
	}
	if nodeTotal == 0 || nodeInconsistent != 0 {
		return snapshotScope{}, fmt.Errorf("ATT staged nodes are incomplete: total=%d inconsistent=%d", nodeTotal, nodeInconsistent)
	}
	return scope, nil
}

func previewResolution(
	ctx context.Context,
	tx pgx.Tx,
	snapshotID uuid.UUID,
	scope snapshotScope,
) (ResolutionReport, error) {
	report := ResolutionReport{SnapshotID: snapshotID, BuildID: scope.BuildID, Source: scope.Source}
	if err := tx.QueryRow(ctx, previewNodesSQL, snapshotID).Scan(
		&report.Nodes.Total, &report.Nodes.Resolved, &report.Nodes.Unresolved,
		&report.Nodes.Ambiguous, &report.Nodes.Excluded,
	); err != nil {
		return ResolutionReport{}, fmt.Errorf("preview ATT source nodes: %w", err)
	}
	if err := tx.QueryRow(ctx, previewReferencesSQL, snapshotID).Scan(
		&report.References.Total, &report.References.Resolved, &report.References.Unresolved,
		&report.References.Ambiguous, &report.References.Excluded,
	); err != nil {
		return ResolutionReport{}, fmt.Errorf("preview ATT source references: %w", err)
	}
	return report, nil
}

func storedResolution(
	ctx context.Context,
	tx pgx.Tx,
	snapshotID uuid.UUID,
	scope snapshotScope,
) (ResolutionReport, error) {
	report := ResolutionReport{SnapshotID: snapshotID, BuildID: scope.BuildID, Source: scope.Source}
	if err := tx.QueryRow(ctx, storedNodesSQL, snapshotID).Scan(
		&report.Nodes.Total, &report.Nodes.Resolved, &report.Nodes.Unresolved,
		&report.Nodes.Ambiguous, &report.Nodes.Excluded,
	); err != nil {
		return ResolutionReport{}, fmt.Errorf("count resolved ATT source nodes: %w", err)
	}
	if err := tx.QueryRow(ctx, storedReferencesSQL, snapshotID).Scan(
		&report.References.Total, &report.References.Resolved, &report.References.Unresolved,
		&report.References.Ambiguous, &report.References.Excluded,
	); err != nil {
		return ResolutionReport{}, fmt.Errorf("count resolved ATT source references: %w", err)
	}
	if report.Nodes.Total != report.Nodes.Resolved+report.Nodes.Unresolved+report.Nodes.Ambiguous+report.Nodes.Excluded {
		return ResolutionReport{}, errors.New("ATT source nodes retained a pending resolution status")
	}
	if report.References.Total != report.References.Resolved+report.References.Unresolved+
		report.References.Ambiguous+report.References.Excluded {
		return ResolutionReport{}, errors.New("ATT source references retained a pending resolution status")
	}
	return report, nil
}

func (s *Store) recordResolutionFailure(ctx context.Context, snapshotID uuid.UUID, resolutionErr error) {
	logContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	errorSummary := strings.TrimSpace(resolutionErr.Error())
	if len(errorSummary) > 1000 {
		errorSummary = errorSummary[:1000]
	}
	_, _ = s.db.Exec(logContext, `
		INSERT INTO catalog_source_resolution_runs (
			snapshot_id,build_id,source,status,error_summary
		)
		SELECT id,build_id,source,'failed',$2
		FROM catalog_snapshots WHERE id=$1 AND source=$3`, snapshotID, errorSummary, Source)
}

const canonicalEntityJoin = `
	LEFT JOIN catalog_source_entity_type_mappings mapping
		ON mapping.source=node.source AND mapping.source_type=%s
	LEFT JOIN game_entities entity
		ON mapping.disposition='resolve'
		AND entity.product_id=build.product_id
		AND entity.entity_type=mapping.canonical_entity_type
		AND entity.external_id=%s
		AND entity.deleted_at IS NULL
		AND EXISTS (
			SELECT 1
			FROM game_entity_versions version
			LEFT JOIN catalog_snapshots version_snapshot ON version_snapshot.id=version.snapshot_id
			LEFT JOIN catalog_source_artifacts version_artifact ON version_artifact.id=version.source_artifact_id
			WHERE version.entity_id=entity.id AND version.build_id=node.build_id
			  AND (version.snapshot_id IS NULL OR version_snapshot.status IN ('validated','published'))
			  AND (
				version.source_artifact_id IS NULL
				OR (
					version_artifact.status='ready'
					AND version_artifact.content_hash IS NOT NULL
					AND version_artifact.byte_size IS NOT NULL
				)
			  )
		)`

const nodeStatusSQL = `CASE
	WHEN node.external_id IS NULL THEN 'excluded'
	WHEN mapping.source_type IS NULL THEN 'excluded'
	WHEN mapping.disposition='exclude' THEN 'excluded'
	WHEN entity.id IS NULL THEN 'unresolved'
	ELSE 'resolved'
END`

const nodeReasonSQL = `CASE
	WHEN node.external_id IS NULL THEN 'missing_external_id'
	WHEN mapping.source_type IS NULL THEN 'unsupported_source_type'
	WHEN mapping.disposition='exclude' THEN mapping.reason
	WHEN entity.id IS NULL THEN 'canonical_entity_unproven_for_build'
	ELSE ''
END`

var nodeEntityJoin = fmt.Sprintf(canonicalEntityJoin, "node.node_kind", "node.external_id")

var resolveNodesSQL = `
	WITH classified AS (
		SELECT node.id,` + nodeStatusSQL + ` AS status,
			CASE WHEN entity.id IS NULL THEN NULL ELSE entity.id END AS entity_id,
			` + nodeReasonSQL + ` AS reason
		FROM catalog_staged_source_nodes node
		JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
		JOIN game_builds build ON build.id=node.build_id
		` + nodeEntityJoin + `
		WHERE artifact.snapshot_id=$1
	)
	UPDATE catalog_staged_source_nodes target
	SET resolution_status=classified.status,
		resolved_entity_id=classified.entity_id,
		resolution_reason=classified.reason,
		updated_at=CASE WHEN (
			target.resolution_status,target.resolved_entity_id,target.resolution_reason
		) IS DISTINCT FROM (
			classified.status,classified.entity_id,classified.reason
		) THEN now() ELSE target.updated_at END
	FROM classified WHERE target.id=classified.id`

var previewNodesSQL = `
	WITH classified AS (
		SELECT ` + nodeStatusSQL + ` AS status
		FROM catalog_staged_source_nodes node
		JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
		JOIN game_builds build ON build.id=node.build_id
		` + nodeEntityJoin + `
		WHERE artifact.snapshot_id=$1
	)
	SELECT count(*),
		count(*) FILTER (WHERE status='resolved'),
		count(*) FILTER (WHERE status='unresolved'),
		count(*) FILTER (WHERE status='ambiguous'),
		count(*) FILTER (WHERE status='excluded')
	FROM classified`

const referenceStatusSQL = `CASE
	WHEN mapping.source_type IS NULL THEN 'excluded'
	WHEN mapping.disposition='exclude' THEN 'excluded'
	WHEN entity.id IS NULL THEN 'unresolved'
	ELSE 'resolved'
END`

const referenceReasonSQL = `CASE
	WHEN mapping.source_type IS NULL THEN 'unsupported_target_type'
	WHEN mapping.disposition='exclude' THEN mapping.reason
	WHEN entity.id IS NULL THEN 'canonical_entity_unproven_for_build'
	ELSE ''
END`

var referenceEntityJoin = fmt.Sprintf(canonicalEntityJoin, "reference.target_type", "reference.target_external_id")

var resolveReferencesSQL = `
	WITH classified AS (
		SELECT reference.id,` + referenceStatusSQL + ` AS status,
			CASE WHEN entity.id IS NULL THEN NULL ELSE entity.id END AS entity_id,
			` + referenceReasonSQL + ` AS reason
		FROM catalog_staged_source_references reference
		JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
		JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
		JOIN game_builds build ON build.id=node.build_id
		` + referenceEntityJoin + `
		WHERE artifact.snapshot_id=$1
	)
	UPDATE catalog_staged_source_references target
	SET resolution_status=classified.status,
		target_entity_id=classified.entity_id,
		resolution_reason=classified.reason,
		updated_at=CASE WHEN (
			target.resolution_status,target.target_entity_id,target.resolution_reason
		) IS DISTINCT FROM (
			classified.status,classified.entity_id,classified.reason
		) THEN now() ELSE target.updated_at END
	FROM classified WHERE target.id=classified.id`

var previewReferencesSQL = `
	WITH classified AS (
		SELECT ` + referenceStatusSQL + ` AS status
		FROM catalog_staged_source_references reference
		JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
		JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
		JOIN game_builds build ON build.id=node.build_id
		` + referenceEntityJoin + `
		WHERE artifact.snapshot_id=$1
	)
	SELECT count(*),
		count(*) FILTER (WHERE status='resolved'),
		count(*) FILTER (WHERE status='unresolved'),
		count(*) FILTER (WHERE status='ambiguous'),
		count(*) FILTER (WHERE status='excluded')
	FROM classified`

const storedNodesSQL = `
	SELECT count(*),
		count(*) FILTER (WHERE node.resolution_status='resolved'),
		count(*) FILTER (WHERE node.resolution_status='unresolved'),
		count(*) FILTER (WHERE node.resolution_status='ambiguous'),
		count(*) FILTER (WHERE node.resolution_status='excluded')
	FROM catalog_staged_source_nodes node
	JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
	WHERE artifact.snapshot_id=$1`

const storedReferencesSQL = `
	SELECT count(*),
		count(*) FILTER (WHERE reference.resolution_status='resolved'),
		count(*) FILTER (WHERE reference.resolution_status='unresolved'),
		count(*) FILTER (WHERE reference.resolution_status='ambiguous'),
		count(*) FILTER (WHERE reference.resolution_status='excluded')
	FROM catalog_staged_source_references reference
	JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
	JOIN catalog_source_artifacts artifact ON artifact.id=node.source_artifact_id
	WHERE artifact.snapshot_id=$1`
