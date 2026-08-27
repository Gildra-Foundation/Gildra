package catalogquality

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ScopeData       = "data"
	ScopeProduction = "production"
)

type ReadinessCheck struct {
	Key      string `json:"key"`
	Scope    string `json:"scope"`
	Status   string `json:"status"`
	Count    int64  `json:"count"`
	Message  string `json:"message"`
	Blocking bool   `json:"blocking"`
}

type ReadinessReport struct {
	Product         string           `json:"product"`
	BuildID         int64            `json:"buildId"`
	BuildVersion    string           `json:"buildVersion"`
	GeneratedAt     time.Time        `json:"generatedAt"`
	DataReady       bool             `json:"dataReady"`
	ProductionReady bool             `json:"productionReady"`
	Checks          []ReadinessCheck `json:"checks"`
}

// EvaluateReadiness verifies the source-backed Retail catalog foundation.
// Missing source translations may be represented as an exact English fallback;
// an unexplained localized value is always a blocking data-quality failure.
func EvaluateReadiness(
	ctx context.Context,
	db *pgxpool.Pool,
	product string,
	buildVersion string,
) (ReadinessReport, error) {
	product = strings.TrimSpace(strings.ToLower(product))
	buildVersion = strings.TrimSpace(buildVersion)
	if product == "" {
		return ReadinessReport{}, errors.New("product is required")
	}

	report := ReadinessReport{
		Product: product, GeneratedAt: time.Now().UTC(), DataReady: true, ProductionReady: true,
		Checks: make([]ReadinessCheck, 0, 14),
	}
	if err := loadReadinessBuild(ctx, db, product, buildVersion, &report); err != nil {
		return ReadinessReport{}, err
	}

	var entityCount, missingVersions int64
	if err := db.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (WHERE entity.latest_version_id IS NULL)
		FROM game_entities entity
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL`, product).Scan(&entityCount, &missingVersions); err != nil {
		return ReadinessReport{}, fmt.Errorf("check entity versions: %w", err)
	}
	report.add("entities", ScopeData, entityCount == 0 || missingVersions != 0, missingVersions,
		fmt.Sprintf("%d active entities; %d without a current version", entityCount, missingVersions))

	var completenessScopes, incompleteScopes int64
	if err := db.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (WHERE status<>'complete')
		FROM catalog_completeness_latest
		WHERE build_id=$1 AND scope_key LIKE 'db2.%'`, report.BuildID).Scan(&completenessScopes, &incompleteScopes); err != nil {
		return ReadinessReport{}, fmt.Errorf("check DB2 completeness: %w", err)
	}
	report.add("db2_completeness", ScopeData, completenessScopes == 0 || incompleteScopes != 0, incompleteScopes,
		fmt.Sprintf("%d DB2 scopes measured; %d incomplete", completenessScopes, incompleteScopes))

	var unprovenVersions int64
	if err := db.QueryRow(ctx, `
		WITH ready_artifacts AS (
			SELECT id FROM catalog_source_artifacts
			WHERE status='ready' AND content_hash IS NOT NULL AND byte_size IS NOT NULL
		), proven_versions AS (
			SELECT version.id
			FROM game_entity_versions version
			JOIN ready_artifacts artifact ON artifact.id=version.source_artifact_id
			UNION
			SELECT observation.version_id
			FROM catalog_entity_version_artifacts observation
			JOIN ready_artifacts artifact ON artifact.id=observation.source_artifact_id
		)
		SELECT count(*)
		FROM game_entities entity
		LEFT JOIN proven_versions proof ON proof.id=entity.latest_version_id
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL AND proof.id IS NULL`, product).Scan(&unprovenVersions); err != nil {
		return ReadinessReport{}, fmt.Errorf("check entity provenance: %w", err)
	}
	report.add("entity_provenance", ScopeData, unprovenVersions != 0, unprovenVersions,
		"current entity versions without a complete source artifact")

	var unprovenEnglish, russianFallbacks, unexplainedRussian int64
	if err := db.QueryRow(ctx, `
		WITH ready_localizations AS (
			SELECT DISTINCT proof.version_id,proof.locale
			FROM catalog_entity_localization_artifacts proof
			JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
			WHERE artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		), current_versions AS (
			SELECT entity.latest_version_id AS version_id
			FROM game_entities entity
			WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			  AND entity.deleted_at IS NULL AND entity.latest_version_id IS NOT NULL
		), english_missing AS (
			SELECT current.version_id
			FROM current_versions current
			JOIN game_entity_localizations english ON english.version_id=current.version_id AND english.locale='en_US'
			LEFT JOIN ready_localizations proof ON proof.version_id=current.version_id AND proof.locale='en_US'
			WHERE proof.version_id IS NULL
		), russian_missing AS (
			SELECT current.version_id,russian.name,english.name AS english_name
			FROM current_versions current
			JOIN game_entity_localizations russian ON russian.version_id=current.version_id AND russian.locale='ru_RU'
			LEFT JOIN game_entity_localizations english ON english.version_id=current.version_id AND english.locale='en_US'
			LEFT JOIN ready_localizations proof ON proof.version_id=current.version_id AND proof.locale='ru_RU'
			WHERE proof.version_id IS NULL
		)
		SELECT
			(SELECT count(*) FROM english_missing),
			(SELECT count(*) FROM russian_missing WHERE name=english_name),
			(SELECT count(*) FROM russian_missing WHERE english_name IS NULL OR name<>english_name)`, product).
		Scan(&unprovenEnglish, &russianFallbacks, &unexplainedRussian); err != nil {
		return ReadinessReport{}, fmt.Errorf("check localization provenance: %w", err)
	}
	report.add("english_localization_provenance", ScopeData, unprovenEnglish != 0, unprovenEnglish,
		"English localizations without a complete source artifact")
	report.add("russian_localization_provenance", ScopeData, unexplainedRussian != 0, unexplainedRussian,
		fmt.Sprintf("%d unexplained Russian values; %d explicit English fallbacks", unexplainedRussian, russianFallbacks))
	report.warn("russian_translation_fallbacks", ScopeData, russianFallbacks,
		"Russian source text is absent; the API must expose these exact English fallbacks as fallback data")

	var unprovenFacts int64
	if err := db.QueryRow(ctx, `
		WITH current_versions AS (
			SELECT entity.latest_version_id AS version_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			  AND entity.deleted_at IS NULL AND version.build_id=$2
		), facts AS (
			SELECT role.version_id,role.source_artifact_id FROM catalog_npc_roles role
			UNION ALL SELECT location.version_id,location.source_artifact_id FROM catalog_npc_locations location
			UNION ALL SELECT acquisition.version_id,acquisition.source_artifact_id FROM catalog_item_acquisition_sources acquisition
			UNION ALL SELECT effect.version_id,effect.source_artifact_id FROM catalog_item_effects effect
			UNION ALL SELECT effect.spell_version_id,effect.source_artifact_id FROM catalog_spell_effects effect
			UNION ALL SELECT recipe.profession_version_id,recipe.source_artifact_id FROM catalog_profession_recipes recipe
			UNION ALL SELECT reagent.recipe_version_id,reagent.source_artifact_id FROM catalog_recipe_reagents reagent
			UNION ALL SELECT currency.recipe_version_id,currency.source_artifact_id FROM catalog_recipe_currencies currency
			UNION ALL SELECT output.recipe_version_id,output.source_artifact_id FROM catalog_recipe_outputs output
			UNION ALL SELECT display.version_id,display.source_artifact_id FROM catalog_creature_displays display
			UNION ALL SELECT difficulty.version_id,difficulty.source_artifact_id FROM catalog_creature_difficulties difficulty
		), invalid AS (
			SELECT fact.version_id
			FROM facts fact
			JOIN current_versions current ON current.version_id=fact.version_id
			LEFT JOIN catalog_source_artifacts artifact ON artifact.id=fact.source_artifact_id
			WHERE artifact.id IS NULL OR artifact.status<>'ready'
			   OR artifact.content_hash IS NULL OR artifact.byte_size IS NULL
		)
		SELECT count(*) FROM invalid`, product, report.BuildID).Scan(&unprovenFacts); err != nil {
		return ReadinessReport{}, fmt.Errorf("check normalized fact provenance: %w", err)
	}
	report.add("normalized_fact_provenance", ScopeData, unprovenFacts != 0, unprovenFacts,
		"normalized facts without a complete source artifact")

	var invalidCreatureFacts int64
	if err := db.QueryRow(ctx, `
		WITH facts AS (
			SELECT source_artifact_id FROM catalog_creature_display_info WHERE build_id=$1
			UNION ALL SELECT source_artifact_id FROM catalog_creature_models WHERE build_id=$1
			UNION ALL SELECT source_artifact_id FROM catalog_creature_taxa WHERE build_id=$1
		)
		SELECT count(*) FROM facts
		LEFT JOIN catalog_source_artifacts artifact ON artifact.id=facts.source_artifact_id
		WHERE artifact.id IS NULL OR artifact.status<>'ready'
		   OR artifact.content_hash IS NULL OR artifact.byte_size IS NULL`, report.BuildID).Scan(&invalidCreatureFacts); err != nil {
		return ReadinessReport{}, fmt.Errorf("check creature fact provenance: %w", err)
	}
	report.add("creature_fact_provenance", ScopeData, invalidCreatureFacts != 0, invalidCreatureFacts,
		"creature display, model, or taxonomy rows without complete proof")

	var invalidRewards, unresolvedItemRewards int64
	if err := db.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE reward.source_build_id IS NULL OR artifact.id IS NULL
				OR artifact.status<>'ready' OR artifact.content_hash IS NULL OR artifact.byte_size IS NULL),
			count(*) FILTER (WHERE reward.reward_type='item' AND reward.external_id IS NOT NULL AND reward.item_entity_id IS NULL)
		FROM catalog_quest_rewards reward
		LEFT JOIN catalog_source_artifacts artifact ON artifact.id=reward.source_artifact_id
		WHERE reward.build_id=$1`, report.BuildID).Scan(&invalidRewards, &unresolvedItemRewards); err != nil {
		return ReadinessReport{}, fmt.Errorf("check quest rewards: %w", err)
	}
	report.add("quest_reward_provenance", ScopeData, invalidRewards != 0, invalidRewards,
		"quest rewards without source-build and complete artifact proof")
	report.add("quest_reward_item_links", ScopeData, unresolvedItemRewards != 0, unresolvedItemRewards,
		"item rewards that do not resolve to catalog items")

	var invalidIcons int64
	if err := db.QueryRow(ctx, `
		SELECT count(*)
		FROM catalog_entity_icons icon
		LEFT JOIN catalog_source_artifacts reference ON reference.id=icon.source_artifact_id
		LEFT JOIN catalog_source_artifacts asset ON asset.id=icon.asset_source_artifact_id
		WHERE icon.build_id=$1 AND (
			reference.id IS NULL OR reference.status<>'ready'
			OR reference.content_hash IS NULL OR reference.byte_size IS NULL
			OR (icon.file_data_id IS NOT NULL AND (
				asset.id IS NULL OR asset.status<>'ready'
				OR asset.content_hash IS NULL OR asset.byte_size IS NULL
			))
		)`, report.BuildID).Scan(&invalidIcons); err != nil {
		return ReadinessReport{}, fmt.Errorf("check icon provenance: %w", err)
	}
	report.add("icon_provenance", ScopeData, invalidIcons != 0, invalidIcons,
		"icon references or file mappings without complete source proof")

	var unresolvedReagents, unresolvedOutputs int64
	if err := db.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM catalog_recipe_reagents reagent
			 JOIN game_entity_versions version ON version.id=reagent.recipe_version_id
			 WHERE version.build_id=$1 AND reagent.item_external_id IS NOT NULL AND reagent.item_entity_id IS NULL),
			(SELECT count(*) FROM catalog_recipe_outputs output
			 JOIN game_entity_versions version ON version.id=output.recipe_version_id
			 WHERE version.build_id=$1 AND output.item_external_id IS NOT NULL AND output.item_entity_id IS NULL)`, report.BuildID).
		Scan(&unresolvedReagents, &unresolvedOutputs); err != nil {
		return ReadinessReport{}, fmt.Errorf("check recipe graph: %w", err)
	}
	report.warn("recipe_item_links", ScopeData, unresolvedReagents+unresolvedOutputs,
		fmt.Sprintf("%d reagents and %d outputs refer to item IDs absent from the source item catalog", unresolvedReagents, unresolvedOutputs))

	var invalidRelations, staleReadModels, runningImports int64
	if err := db.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM game_entity_links link
			 LEFT JOIN catalog_relation_types relation ON relation.relation_type=link.relation_type
			 WHERE relation.relation_type IS NULL),
			(SELECT count(*) FROM catalog_read_model_state state
			 JOIN game_products product ON product.id=state.product_id
			 WHERE product.slug=$1 AND state.status<>'fresh'),
			(SELECT count(*) FROM catalog_import_runs run
			 JOIN game_products product ON product.id=run.product_id
			 WHERE product.slug=$1 AND run.status='RUNNING')`, product).
		Scan(&invalidRelations, &staleReadModels, &runningImports); err != nil {
		return ReadinessReport{}, fmt.Errorf("check runtime catalog state: %w", err)
	}
	report.add("registered_relations", ScopeData, invalidRelations != 0, invalidRelations,
		"relationships with an unregistered semantic type")
	report.add("read_model", ScopeData, staleReadModels != 0, staleReadModels,
		"catalog read model is not fresh")
	report.add("imports_idle", ScopeData, runningImports != 0, runningImports,
		"catalog import runs still in progress")

	var blockedSources int64
	if err := db.QueryRow(ctx, `
		WITH used_sources AS (
			SELECT DISTINCT artifact.source
			FROM catalog_source_artifacts artifact
			WHERE artifact.build_id=$1 AND artifact.status IN ('ready','sampled')
		)
		SELECT count(*)
		FROM used_sources used
		LEFT JOIN catalog_source_policies policy ON policy.source=used.source
		WHERE policy.source IS NULL OR policy.review_status<>'reviewed'
		   OR policy.public_api_status NOT IN ('allowed','restricted')
		   OR policy.commercial_use_status NOT IN ('allowed','restricted')`, report.BuildID).Scan(&blockedSources); err != nil {
		return ReadinessReport{}, fmt.Errorf("check source publication policy: %w", err)
	}
	report.add("source_publication_policy", ScopeProduction, blockedSources != 0, blockedSources,
		"used sources without a reviewed, publication-compatible policy")

	var verifiedBackups int64
	if err := db.QueryRow(ctx, `
		SELECT count(*) FROM catalog_backup_manifests manifest
		WHERE manifest.component='postgres' AND manifest.status='verified'
		  AND manifest.storage_uri ~ '^(s3|r2|swift)://'
		  AND manifest.content_hash IS NOT NULL AND manifest.byte_size>0
		  AND manifest.restore_completed_at>=now()-interval '24 hours'
		  AND manifest.verification @> '{"restore_verified":true,"source_restore_match":true}'::jsonb
		  AND (manifest.product_id IS NULL OR manifest.product_id=(SELECT id FROM game_products WHERE slug=$1))`, product).
		Scan(&verifiedBackups); err != nil {
		return ReadinessReport{}, fmt.Errorf("check recovery evidence: %w", err)
	}
	report.add("off_host_restore_proof", ScopeProduction, verifiedBackups == 0, verifiedBackups,
		"recent verified off-host backup and restore proof")

	return report, nil
}

func loadReadinessBuild(
	ctx context.Context,
	db *pgxpool.Pool,
	product string,
	buildVersion string,
	report *ReadinessReport,
) error {
	query := `
		SELECT build.id,build.version
		FROM game_builds build
		JOIN game_products product ON product.id=build.product_id
		WHERE product.slug=$1`
	args := []any{product}
	if buildVersion != "" {
		query += ` AND build.version=$2`
		args = append(args, buildVersion)
	}
	query += ` ORDER BY build.is_active DESC,build.build_number DESC LIMIT 1`
	if err := db.QueryRow(ctx, query, args...).Scan(&report.BuildID, &report.BuildVersion); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("catalog build not found for %s %s", product, buildVersion)
		}
		return fmt.Errorf("load readiness build: %w", err)
	}
	return nil
}

func (report *ReadinessReport) add(key, scope string, failed bool, count int64, message string) {
	status := "pass"
	if failed {
		status = "fail"
		if scope == ScopeData {
			report.DataReady = false
		}
		report.ProductionReady = false
	}
	report.Checks = append(report.Checks, ReadinessCheck{
		Key: key, Scope: scope, Status: status, Count: count, Message: message, Blocking: failed,
	})
}

func (report *ReadinessReport) warn(key, scope string, count int64, message string) {
	status := "pass"
	if count > 0 {
		status = "warning"
	}
	report.Checks = append(report.Checks, ReadinessCheck{
		Key: key, Scope: scope, Status: status, Count: count, Message: message,
	})
}
