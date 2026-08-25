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
		if err := validateReleaseProvenance(ctx, tx, releaseID, *buildID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_releases
			SET status='validating',validated_at=now(),updated_at=now()
			WHERE id=$1`, releaseID); err != nil {
			return fmt.Errorf("validate catalog release: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_file_assets(
				file_data_id,path,icon_name,source_url,content_hash,snapshot_id,source_artifact_id,imported_at
			)
			SELECT DISTINCT ON (candidate.file_data_id)
				candidate.file_data_id,candidate.path,candidate.icon_name,candidate.source_url,
				candidate.content_hash,candidate.snapshot_id,candidate.source_artifact_id,candidate.imported_at
			FROM catalog_file_asset_versions candidate
			JOIN catalog_snapshots snapshot ON snapshot.id=candidate.snapshot_id
			WHERE snapshot.release_id=$1
			ORDER BY candidate.file_data_id,snapshot.created_at DESC,candidate.imported_at DESC
			ON CONFLICT(file_data_id) DO UPDATE SET
				path=EXCLUDED.path,
				icon_name=EXCLUDED.icon_name,
				source_url=EXCLUDED.source_url,
				content_hash=EXCLUDED.content_hash,
				snapshot_id=EXCLUDED.snapshot_id,
				source_artifact_id=EXCLUDED.source_artifact_id,
				imported_at=EXCLUDED.imported_at`, releaseID); err != nil {
			return fmt.Errorf("publish catalog file assets: %w", err)
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

func validateReleaseProvenance(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID, buildID int64) error {
	var unprovenVersions, unprovenFacts int64
	err := tx.QueryRow(ctx, `
		WITH release_artifacts AS (
			SELECT artifact.id
			FROM catalog_source_artifacts artifact
			JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
			WHERE snapshot.release_id=$1 AND artifact.status='ready'
		), candidate_versions AS (
			SELECT version.id,version.source_artifact_id
			FROM game_entity_versions version
			JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
			WHERE snapshot.release_id=$1
		), normalized_facts AS (
			SELECT role.version_id,role.source_artifact_id FROM catalog_npc_roles role
			UNION ALL SELECT location.version_id,location.source_artifact_id FROM catalog_npc_locations location
			UNION ALL SELECT acquisition.version_id,acquisition.source_artifact_id FROM catalog_item_acquisition_sources acquisition
			UNION ALL SELECT effect.version_id,effect.source_artifact_id FROM catalog_item_effects effect
			UNION ALL SELECT effect.spell_version_id,effect.source_artifact_id FROM catalog_spell_effects effect
			UNION ALL SELECT recipe.profession_version_id,recipe.source_artifact_id FROM catalog_profession_recipes recipe
			UNION ALL SELECT reagent.recipe_version_id,reagent.source_artifact_id FROM catalog_recipe_reagents reagent
			UNION ALL SELECT currency.recipe_version_id,currency.source_artifact_id FROM catalog_recipe_currencies currency
			UNION ALL SELECT output.recipe_version_id,output.source_artifact_id FROM catalog_recipe_outputs output
			UNION ALL
			SELECT variant.item_version_id,effect.source_artifact_id
			FROM catalog_item_variant_effects effect
			JOIN catalog_item_variants variant ON variant.id=effect.variant_id
		), unproven_versions AS (
			SELECT candidate.id
			FROM candidate_versions candidate
			LEFT JOIN release_artifacts artifact ON artifact.id=candidate.source_artifact_id
			WHERE artifact.id IS NULL
		), unproven_normalized_facts AS (
			SELECT fact.version_id
			FROM normalized_facts fact
			JOIN candidate_versions candidate ON candidate.id=fact.version_id
			LEFT JOIN release_artifacts artifact ON artifact.id=fact.source_artifact_id
			WHERE artifact.id IS NULL
		), unproven_quest_rewards AS (
			SELECT reward.quest_id
			FROM catalog_quest_rewards reward
			LEFT JOIN release_artifacts artifact ON artifact.id=reward.source_artifact_id
			WHERE reward.build_id=$2 AND artifact.id IS NULL
		), unproven_file_assets AS (
			SELECT candidate.file_data_id
			FROM catalog_file_asset_versions candidate
			JOIN catalog_snapshots snapshot ON snapshot.id=candidate.snapshot_id
			LEFT JOIN release_artifacts artifact ON artifact.id=candidate.source_artifact_id
			WHERE snapshot.release_id=$1 AND artifact.id IS NULL
		)
		SELECT
			(SELECT count(*) FROM unproven_versions),
			(SELECT count(*) FROM unproven_normalized_facts) +
			(SELECT count(*) FROM unproven_quest_rewards) +
			(SELECT count(*) FROM unproven_file_assets)`, releaseID, buildID).Scan(&unprovenVersions, &unprovenFacts)
	if err != nil {
		return fmt.Errorf("validate catalog release provenance: %w", err)
	}
	if unprovenVersions != 0 || unprovenFacts != 0 {
		return fmt.Errorf("%w: missing_provenance versions=%d normalized_facts=%d",
			ErrReleaseNotPublishable, unprovenVersions, unprovenFacts)
	}
	return nil
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
