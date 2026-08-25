package catalogrelease

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrReleaseNotPublishable = errors.New("catalog release is not publishable")
var ErrBuildAlreadyPublished = errors.New("catalog build is already published")

type Manager struct {
	db *pgxpool.Pool
}

func NewManager(db *pgxpool.Pool) *Manager {
	return &Manager{db: db}
}

func (m *Manager) Start(
	ctx context.Context,
	pipelineRunID int64,
	product, buildVersion string,
	sources []string,
) (uuid.UUID, error) {
	product = strings.TrimSpace(product)
	buildVersion = strings.TrimSpace(buildVersion)
	if pipelineRunID <= 0 || product == "" || buildVersion == "" || len(sources) == 0 {
		return uuid.Nil, errors.New("pipeline run, product, build version, and sources are required")
	}
	var productExists, buildAlreadyPublished bool
	if err := m.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM game_products WHERE slug=$1),EXISTS(
			SELECT 1
			FROM catalog_public_release_state public_state
			JOIN catalog_releases published ON published.id=public_state.release_id
			JOIN game_products product ON product.id=public_state.product_id
			WHERE product.slug=$1 AND published.build_version=$2 AND published.status='published'
		)`, product, buildVersion).Scan(&productExists, &buildAlreadyPublished); err != nil {
		return uuid.Nil, fmt.Errorf("check published catalog build: %w", err)
	}
	if !productExists {
		return uuid.Nil, fmt.Errorf("start catalog release: product %q does not exist", product)
	}
	if buildAlreadyPublished {
		return uuid.Nil, fmt.Errorf("%w: %s", ErrBuildAlreadyPublished, buildVersion)
	}
	var releaseID uuid.UUID
	err := m.db.QueryRow(ctx, `
		INSERT INTO catalog_releases(
			product_id,pipeline_run_id,previous_release_id,build_version,requested_sources
		)
		SELECT product.id,$2,public_state.release_id,$3,$4
		FROM game_products product
		LEFT JOIN catalog_public_release_state public_state ON public_state.product_id=product.id
		WHERE product.slug=$1
		RETURNING id`, product, pipelineRunID, buildVersion, sources).Scan(&releaseID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("start catalog release: %w", err)
	}
	return releaseID, nil
}

func (m *Manager) Publish(ctx context.Context, releaseID uuid.UUID) error {
	if releaseID == uuid.Nil {
		return errors.New("release ID is required")
	}
	return pgx.BeginFunc(ctx, m.db, func(tx pgx.Tx) error {
		var productID int16
		var buildID *int64
		var previousReleaseID *uuid.UUID
		var status string
		if err := tx.QueryRow(ctx, `
			SELECT product_id,build_id,previous_release_id,status
			FROM catalog_releases WHERE id=$1 FOR UPDATE`, releaseID).
			Scan(&productID, &buildID, &previousReleaseID, &status); err != nil {
			return fmt.Errorf("lock catalog release: %w", err)
		}
		if status == "published" {
			return nil
		}
		if status != "staging" || buildID == nil {
			return fmt.Errorf("%w: status=%s build_bound=%t", ErrReleaseNotPublishable, status, buildID != nil)
		}
		var snapshots, invalidSnapshots int64
		if err := tx.QueryRow(ctx, `
			SELECT count(*),count(*) FILTER (WHERE status<>'validated')
			FROM catalog_snapshots WHERE release_id=$1`, releaseID).
			Scan(&snapshots, &invalidSnapshots); err != nil {
			return fmt.Errorf("validate release snapshots: %w", err)
		}
		if snapshots == 0 || invalidSnapshots != 0 {
			return fmt.Errorf("%w: snapshots=%d invalid=%d", ErrReleaseNotPublishable, snapshots, invalidSnapshots)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_releases
			SET status='validating',validated_at=now(),updated_at=now()
			WHERE id=$1`, releaseID); err != nil {
			return fmt.Errorf("validate catalog release: %w", err)
		}
		command, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET published_version_id=entity.latest_version_id,
				canonical_slug=COALESCE((
					SELECT NULLIF(localized.slug,'')
					FROM game_entity_localizations localized
					WHERE localized.version_id=entity.latest_version_id
					ORDER BY (localized.locale='en_US') DESC,localized.locale
					LIMIT 1
				),entity.canonical_slug),
				last_seen_build_id=version.build_id,
				deleted_at=NULL,
				updated_at=now()
			FROM game_entity_versions version
			JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
			WHERE entity.product_id=$2
			  AND version.id=entity.latest_version_id
			  AND snapshot.release_id=$1`, releaseID, productID)
		if err != nil {
			return fmt.Errorf("publish catalog entity versions: %w", err)
		}
		if command.RowsAffected() == 0 {
			var hasPublishedCatalog bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM game_entities
					WHERE product_id=$1 AND deleted_at IS NULL AND published_version_id IS NOT NULL
				)`, productID).Scan(&hasPublishedCatalog); err != nil {
				return fmt.Errorf("verify no-op catalog release: %w", err)
			}
			if !hasPublishedCatalog {
				return fmt.Errorf("%w: release has no candidate entity versions", ErrReleaseNotPublishable)
			}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_snapshots
			SET status='published',published_at=now()
			WHERE release_id=$1 AND status='validated'`, releaseID); err != nil {
			return fmt.Errorf("publish catalog snapshots: %w", err)
		}
		if previousReleaseID != nil {
			if _, err := tx.Exec(ctx, `
				UPDATE catalog_releases
				SET status='superseded',updated_at=now()
				WHERE id=$1 AND status='published'`, *previousReleaseID); err != nil {
				return fmt.Errorf("supersede previous catalog release: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_public_release_state(product_id,release_id)
			VALUES($1,$2)
			ON CONFLICT(product_id) DO UPDATE SET release_id=EXCLUDED.release_id,updated_at=now()`,
			productID, releaseID); err != nil {
			return fmt.Errorf("select public catalog release: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_builds SET is_active=(id=$2) WHERE product_id=$1`, productID, *buildID); err != nil {
			return fmt.Errorf("activate catalog release build: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_releases
			SET status='published',published_at=now(),updated_at=now()
			WHERE id=$1`, releaseID); err != nil {
			return fmt.Errorf("finish catalog release publication: %w", err)
		}
		return nil
	})
}

func (m *Manager) Fail(ctx context.Context, releaseID uuid.UUID, cause error) error {
	if releaseID == uuid.Nil {
		return nil
	}
	errorSummary := "catalog release failed"
	if cause != nil {
		errorSummary = cause.Error()
	}
	if len(errorSummary) > 2000 {
		errorSummary = errorSummary[:2000]
	}
	return pgx.BeginFunc(ctx, m.db, func(tx pgx.Tx) error {
		var productID int16
		var status string
		if err := tx.QueryRow(ctx, `
			SELECT product_id,status FROM catalog_releases WHERE id=$1 FOR UPDATE`, releaseID).
			Scan(&productID, &status); err != nil {
			return fmt.Errorf("lock failed catalog release: %w", err)
		}
		if status == "published" || status == "superseded" {
			return fmt.Errorf("cannot fail catalog release in status %s", status)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_snapshots
			SET status='failed',failed_at=COALESCE(failed_at,now())
			WHERE release_id=$1 AND status IN ('staging','validated')`, releaseID); err != nil {
			return fmt.Errorf("fail catalog release snapshots: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			WITH affected AS (
				SELECT DISTINCT version.entity_id
				FROM game_entity_versions version
				JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
				WHERE snapshot.release_id=$1
			)
			UPDATE game_entities entity
			SET latest_version_id=published_version_id,
				deleted_at=CASE WHEN published_version_id IS NULL THEN COALESCE(deleted_at,now()) ELSE deleted_at END,
				updated_at=now()
			WHERE entity.id IN (SELECT entity_id FROM affected)
			  AND entity.product_id=$2
			  AND entity.latest_version_id IS DISTINCT FROM entity.published_version_id`, releaseID, productID); err != nil {
			return fmt.Errorf("restore published catalog pointers: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_releases
			SET status='failed',error_summary=$2,failed_at=COALESCE(failed_at,now()),updated_at=now()
			WHERE id=$1`, releaseID, errorSummary); err != nil {
			return fmt.Errorf("fail catalog release: %w", err)
		}
		return nil
	})
}
