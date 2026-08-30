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
		var requestedSources []string
		var status string
		if err := tx.QueryRow(ctx, `
			SELECT product_id,build_id,previous_release_id,requested_sources,status
			FROM catalog_releases WHERE id=$1 FOR UPDATE`, releaseID).
			Scan(&productID, &buildID, &previousReleaseID, &requestedSources, &status); err != nil {
			return fmt.Errorf("lock catalog release: %w", err)
		}
		if status == "published" {
			return nil
		}
		if status != "staging" || buildID == nil {
			return fmt.Errorf("%w: status=%s build_bound=%t", ErrReleaseNotPublishable, status, buildID != nil)
		}
		var snapshots, invalidSnapshots, invalidArtifacts int64
		if err := tx.QueryRow(ctx, `
			SELECT
				count(*),
				count(*) FILTER (WHERE snapshot.status<>'validated'),
				(SELECT count(*)
				 FROM catalog_source_artifacts artifact
				 JOIN catalog_snapshots artifact_snapshot ON artifact_snapshot.id=artifact.snapshot_id
				 WHERE artifact_snapshot.release_id=$1
				   AND (artifact.status<>'ready' OR artifact.content_hash IS NULL OR artifact.byte_size IS NULL))
			FROM catalog_snapshots snapshot WHERE snapshot.release_id=$1`, releaseID).
			Scan(&snapshots, &invalidSnapshots, &invalidArtifacts); err != nil {
			return fmt.Errorf("validate release snapshots: %w", err)
		}
		if snapshots == 0 || invalidSnapshots != 0 || invalidArtifacts != 0 {
			return fmt.Errorf("%w: snapshots=%d invalid=%d invalid_artifacts=%d",
				ErrReleaseNotPublishable, snapshots, invalidSnapshots, invalidArtifacts)
		}
		if err := validateReleaseProvenance(ctx, tx, releaseID, *buildID); err != nil {
			return err
		}
		if err := validateReleaseQuality(ctx, tx, releaseID); err != nil {
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
		// Public read models must observe the pointers selected in this same
		// transaction. Refreshing before Publish leaves newly released entity
		// types and library datasets stale until a later maintenance run.
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_read_models($1)`, productID); err != nil {
			return fmt.Errorf("refresh published catalog read models: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_datasets($1)`, productID); err != nil {
			return fmt.Errorf("refresh published library datasets: %w", err)
		}
		if releaseUsesSource(requestedSources, "db2") {
			if _, err := tx.Exec(ctx, `SELECT assert_catalog_ui_map_read_model($1,$2)`, productID, *buildID); err != nil {
				return fmt.Errorf("verify published ui_map read model: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_published_source_dependencies()`); err != nil {
			return fmt.Errorf("refresh published source dependencies: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_coverage($1)`, productID); err != nil {
			return fmt.Errorf("refresh published library media coverage: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_previews($1)`, productID); err != nil {
			return fmt.Errorf("refresh published library media previews: %w", err)
		}
		return nil
	})
}

func releaseUsesSource(sources []string, expected string) bool {
	expected = strings.ToLower(strings.TrimSpace(expected))
	for _, source := range sources {
		if strings.ToLower(strings.TrimSpace(source)) == expected {
			return true
		}
	}
	return false
}

// validateReleaseQuality is intentionally evaluated in the same transaction
// as publication.  A candidate version may be newer than the public version,
// but it must not make already published facts disappear from the API.  The
// SQL function also reports non-blocking enrichment warnings. The publication
// transaction deliberately enforces only blocking rows; operators can query
// the same function to see missing enrichment without making a release appear
// complete by silently discarding the warning.
func validateReleaseQuality(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID) error {
	rows, err := tx.Query(ctx, `
		SELECT check_key,failed_count,blocking
		FROM catalog_release_quality_gate($1)
		WHERE blocking AND failed_count>0
		ORDER BY check_key`, releaseID)
	if err != nil {
		return fmt.Errorf("run catalog release quality gate: %w", err)
	}
	defer rows.Close()
	failures := make([]string, 0, 4)
	for rows.Next() {
		var checkKey string
		var failedCount int64
		var blocking bool
		if err := rows.Scan(&checkKey, &failedCount, &blocking); err != nil {
			return fmt.Errorf("read catalog release quality gate: %w", err)
		}
		if blocking && failedCount > 0 {
			failures = append(failures, fmt.Sprintf("%s=%d", checkKey, failedCount))
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate catalog release quality gate: %w", err)
	}
	if len(failures) != 0 {
		return fmt.Errorf("%w: quality_gate %s", ErrReleaseNotPublishable, strings.Join(failures, ", "))
	}
	return nil
}

func validateReleaseProvenance(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID, buildID int64) error {
	var unprovenVersions, unprovenFacts, unprovenLocalizations, invalidIcons int64
	err := tx.QueryRow(ctx, `
		WITH release_artifacts AS (
			SELECT artifact.id
			FROM catalog_source_artifacts artifact
			JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
			WHERE snapshot.release_id=$1 AND artifact.status='ready'
			  AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		), candidate_versions AS (
			SELECT version.id,version.source_artifact_id
			FROM game_entity_versions version
			JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
			WHERE snapshot.release_id=$1
		), normalized_facts AS (
			SELECT role.version_id,role.source_artifact_id FROM catalog_npc_roles role
			UNION ALL SELECT location.version_id,location.source_artifact_id FROM catalog_npc_locations location
			UNION ALL SELECT acquisition.version_id,acquisition.source_artifact_id FROM catalog_item_acquisition_sources acquisition
			UNION ALL SELECT stat.version_id,stat.source_artifact_id FROM catalog_item_stats stat
			UNION ALL SELECT effect.version_id,effect.source_artifact_id FROM catalog_item_effects effect
			UNION ALL SELECT effect.spell_version_id,effect.source_artifact_id FROM catalog_spell_effects effect
			UNION ALL SELECT recipe.profession_version_id,recipe.source_artifact_id FROM catalog_profession_recipes recipe
			UNION ALL SELECT reagent.recipe_version_id,reagent.source_artifact_id FROM catalog_recipe_reagents reagent
			UNION ALL SELECT currency.recipe_version_id,currency.source_artifact_id FROM catalog_recipe_currencies currency
			UNION ALL SELECT output.recipe_version_id,output.source_artifact_id FROM catalog_recipe_outputs output
			UNION ALL SELECT display.version_id,display.source_artifact_id FROM catalog_creature_displays display
			UNION ALL SELECT difficulty.version_id,difficulty.source_artifact_id FROM catalog_creature_difficulties difficulty
			UNION ALL
			SELECT variant.item_version_id,stat.source_artifact_id
			FROM catalog_item_variant_stats stat
			JOIN catalog_item_variants variant ON variant.id=stat.variant_id
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
			WHERE reward.build_id=$2 AND (artifact.id IS NULL OR reward.source_build_id IS NULL
			  OR (reward.reward_type='item' AND reward.external_id IS NOT NULL AND reward.item_entity_id IS NULL))
		), unproven_file_assets AS (
			SELECT candidate.file_data_id
			FROM catalog_file_asset_versions candidate
			JOIN catalog_snapshots snapshot ON snapshot.id=candidate.snapshot_id
			LEFT JOIN release_artifacts artifact ON artifact.id=candidate.source_artifact_id
			WHERE snapshot.release_id=$1 AND artifact.id IS NULL
		), unproven_creature_build_facts AS (
			SELECT info.external_id
			FROM catalog_creature_display_info info
			LEFT JOIN release_artifacts artifact ON artifact.id=info.source_artifact_id
			WHERE info.build_id=$2 AND artifact.id IS NULL
			UNION ALL
			SELECT model.external_id
			FROM catalog_creature_models model
			LEFT JOIN release_artifacts artifact ON artifact.id=model.source_artifact_id
			WHERE model.build_id=$2 AND artifact.id IS NULL
			UNION ALL
			SELECT taxon.external_id
			FROM catalog_creature_taxa taxon
			LEFT JOIN release_artifacts artifact ON artifact.id=taxon.source_artifact_id
			WHERE taxon.build_id=$2 AND artifact.id IS NULL
		), unproven_localizations AS (
			SELECT localized.version_id
			FROM candidate_versions candidate
			JOIN game_entity_localizations localized ON localized.version_id=candidate.id
			LEFT JOIN game_entity_localizations english ON english.version_id=candidate.id AND english.locale='en_US'
			WHERE NOT EXISTS (
				SELECT 1
				FROM catalog_entity_localization_artifacts observation
				JOIN release_artifacts artifact ON artifact.id=observation.source_artifact_id
				JOIN catalog_source_artifacts source_artifact ON source_artifact.id=observation.source_artifact_id
				WHERE observation.version_id=candidate.id AND observation.locale=localized.locale
				  AND (source_artifact.locale='' OR source_artifact.locale=observation.locale)
			) AND NOT (localized.locale='ru_RU' AND localized.name=english.name)
		), invalid_entity_icons AS (
			SELECT icon.external_id
			FROM catalog_entity_icons icon
			LEFT JOIN release_artifacts reference ON reference.id=icon.source_artifact_id
			LEFT JOIN release_artifacts asset ON asset.id=icon.asset_source_artifact_id
			WHERE icon.build_id=$2 AND (reference.id IS NULL OR (icon.file_data_id IS NOT NULL AND asset.id IS NULL))
		)
		SELECT
			(SELECT count(*) FROM unproven_versions),
			(SELECT count(*) FROM unproven_normalized_facts) +
			(SELECT count(*) FROM unproven_quest_rewards) +
			(SELECT count(*) FROM unproven_file_assets) +
			(SELECT count(*) FROM unproven_creature_build_facts),
			(SELECT count(*) FROM unproven_localizations),
			(SELECT count(*) FROM invalid_entity_icons)`, releaseID, buildID).Scan(
		&unprovenVersions, &unprovenFacts, &unprovenLocalizations, &invalidIcons,
	)
	if err != nil {
		return fmt.Errorf("validate catalog release provenance: %w", err)
	}
	if unprovenVersions != 0 || unprovenFacts != 0 || unprovenLocalizations != 0 || invalidIcons != 0 {
		return fmt.Errorf("%w: missing_provenance versions=%d normalized_facts=%d localizations=%d icons=%d",
			ErrReleaseNotPublishable, unprovenVersions, unprovenFacts, unprovenLocalizations, invalidIcons)
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
