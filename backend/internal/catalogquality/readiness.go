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
	ScopeData                      = "data"
	ScopeProduction                = "production"
	RecoveryPolicyOffHost          = "off_host"
	RecoveryPolicyVerifiedSameHost = "verified_same_host"
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

// EvaluateReadiness verifies the source-backed product catalog foundation.
// Missing source translations may be represented as an exact English fallback;
// an unexplained localized value is always a blocking data-quality failure.
func EvaluateReadiness(
	ctx context.Context,
	db *pgxpool.Pool,
	product string,
	buildVersion string,
) (ReadinessReport, error) {
	return EvaluateReadinessWithRecoveryPolicy(ctx, db, product, buildVersion, RecoveryPolicyOffHost)
}

// EvaluateReadinessWithRecoveryPolicy keeps off-host recovery as the safe
// default while allowing an explicitly selected, restore-tested same-host
// backup for installations that accept host-loss risk.
func EvaluateReadinessWithRecoveryPolicy(
	ctx context.Context,
	db *pgxpool.Pool,
	product string,
	buildVersion string,
	recoveryPolicy string,
) (ReadinessReport, error) {
	product = strings.TrimSpace(strings.ToLower(product))
	buildVersion = strings.TrimSpace(buildVersion)
	if product == "" {
		return ReadinessReport{}, errors.New("product is required")
	}
	storagePattern, recoveryKey, recoveryMessage, err := RecoveryPolicySettings(recoveryPolicy)
	if err != nil {
		return ReadinessReport{}, err
	}

	report := ReadinessReport{
		Product: product, GeneratedAt: time.Now().UTC(), DataReady: true, ProductionReady: true,
		Checks: make([]ReadinessCheck, 0, 20),
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

	var activeProfiles, requiredTypes, missingRequiredTypes int64
	if err := db.QueryRow(ctx, `
		WITH profile AS (
			SELECT profile_key FROM catalog_release_profiles profile
			JOIN game_products product ON product.id=profile.product_id
			WHERE product.slug=$1 AND profile.status='active'
			ORDER BY profile.profile_key LIMIT 1
		), required_types AS (
			SELECT scope.entity_type,scope.minimum_count
			FROM catalog_release_profile_entity_types scope
			JOIN profile ON profile.profile_key=scope.profile_key
			WHERE scope.requirement='required'
		), entity_counts AS (
			SELECT entity.entity_type,count(*) AS entity_count
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			  AND entity.deleted_at IS NULL AND version.build_id=$2
			GROUP BY entity.entity_type
		)
		SELECT
			(SELECT count(*) FROM profile),
			(SELECT count(*) FROM required_types),
			(SELECT count(*) FROM required_types required
			 LEFT JOIN entity_counts actual ON actual.entity_type=required.entity_type
			 WHERE COALESCE(actual.entity_count,0)<required.minimum_count)`, product, report.BuildID).
		Scan(&activeProfiles, &requiredTypes, &missingRequiredTypes); err != nil {
		return ReadinessReport{}, fmt.Errorf("check product release profile: %w", err)
	}
	report.add("release_profile_scope", ScopeData,
		activeProfiles != 1 || requiredTypes == 0 || missingRequiredTypes != 0,
		missingRequiredTypes,
		fmt.Sprintf("%d active profile; %d required entity types; %d below minimum", activeProfiles, requiredTypes, missingRequiredTypes))

	var completenessScopes, incompleteScopes int64
	if err := db.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (WHERE status<>'complete')
		FROM catalog_completeness_latest
		WHERE build_id=$1 AND scope_key LIKE 'db2.%'`, report.BuildID).Scan(&completenessScopes, &incompleteScopes); err != nil {
		return ReadinessReport{}, fmt.Errorf("check DB2 completeness: %w", err)
	}
	report.add("db2_completeness", ScopeData, completenessScopes == 0 || incompleteScopes != 0, incompleteScopes,
		fmt.Sprintf("%d DB2 scopes measured; %d incomplete", completenessScopes, incompleteScopes))

	var unavailableDB2Artifacts, approvedUnavailableDB2Artifacts int64
	if err := db.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE NOT EXISTS (
				SELECT 1
				FROM catalog_release_profiles profile
				JOIN catalog_release_profile_artifact_rules rule
				  ON rule.profile_key=profile.profile_key
				 AND rule.source=artifact.source
				 AND rule.artifact_key=artifact.artifact_key
				 AND (rule.locale='' OR rule.locale=artifact.locale)
				 AND rule.requirement='not_applicable'
				WHERE profile.product_id=build.product_id AND profile.status='active'
			)),
			count(*) FILTER (WHERE EXISTS (
				SELECT 1
				FROM catalog_release_profiles profile
				JOIN catalog_release_profile_artifact_rules rule
				  ON rule.profile_key=profile.profile_key
				 AND rule.source=artifact.source
				 AND rule.artifact_key=artifact.artifact_key
				 AND (rule.locale='' OR rule.locale=artifact.locale)
				 AND rule.requirement='not_applicable'
				WHERE profile.product_id=build.product_id AND profile.status='active'
			))
		FROM catalog_source_artifacts artifact
		JOIN game_builds build ON build.id=artifact.build_id
		WHERE artifact.build_id=$1 AND artifact.source='wago_tools' AND artifact.status='unavailable'`, report.BuildID).
		Scan(&unavailableDB2Artifacts, &approvedUnavailableDB2Artifacts); err != nil {
		return ReadinessReport{}, fmt.Errorf("check unavailable DB2 artifacts: %w", err)
	}
	report.add("db2_unavailable_tables", ScopeData, unavailableDB2Artifacts != 0, unavailableDB2Artifacts,
		"Wago does not publish these build/table/locale exports and no active release profile marks them not_applicable")
	report.warn("db2_not_applicable_tables", ScopeData, approvedUnavailableDB2Artifacts,
		"Wago does not publish these exports because the active product profile explicitly marks them not_applicable")

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
	WITH current_versions AS MATERIALIZED (
		SELECT entity.latest_version_id AS version_id
		FROM game_entities entity
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL AND entity.latest_version_id IS NOT NULL
	), ready_localizations AS (
		SELECT DISTINCT proof.version_id,proof.locale
		FROM current_versions current
		JOIN catalog_entity_localization_artifacts proof ON proof.version_id=current.version_id
		JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
		WHERE artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND (artifact.locale='' OR artifact.locale=proof.locale)
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

	var unresolvedDescriptionTemplates int64
	if err := db.QueryRow(ctx, `
		SELECT count(*)
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN game_entity_localizations localization ON localization.version_id=version.id
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL
		  AND localization.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'`, product).
		Scan(&unresolvedDescriptionTemplates); err != nil {
		return ReadinessReport{}, fmt.Errorf("check unresolved description templates: %w", err)
	}
	// Unresolved client templates are not a structural import failure, so the
	// private catalog may still be inspected and repaired. They are, however,
	// a hard production-publication failure: exposing `$s1`, `$d` or
	// `$@spelldesc...` is worse than withholding the record from the public
	// library and falsely presenting an incomplete description as finished.
	report.add("description_template_tokens", ScopeProduction, unresolvedDescriptionTemplates != 0, unresolvedDescriptionTemplates,
		"source descriptions still contain unresolved Blizzard template tokens; public publication waits for build-pinned resolution")

	// A source artifact can be complete while the user-facing record is still
	// unusable.  Do not let a candidate with an empty locale or an absent core
	// description pass the production gate just because the DB2 row itself was
	// imported successfully.  The query deliberately scopes descriptions to
	// item, spell and quest records: those are the entities for which the
	// library promises explanatory text.  A materialized item/spell tooltip is
	// accepted when the short Description_lang field is legitimately empty;
	// quests still require their narrative description. Other entity types may
	// legitimately be registry-only and remain covered by provenance checks.
	var missingEnglishNames, missingRussianNames int64
	var missingEnglishDescriptions, missingRussianDescriptions int64
	if err := db.QueryRow(ctx, `
		WITH current_versions AS MATERIALIZED (
			SELECT entity.id,entity.entity_type,version.id AS version_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			  AND entity.deleted_at IS NULL
		), localized AS MATERIALIZED (
			SELECT current.entity_type,
				COALESCE(NULLIF(btrim(english.name),''),'') AS english_name,
				COALESCE(NULLIF(btrim(russian.name),''),NULLIF(btrim(english.name),''),'') AS russian_name,
				COALESCE(NULLIF(btrim(english.description),''),'') AS english_description,
				COALESCE(NULLIF(btrim(russian.description),''),NULLIF(btrim(english.description),''),'') AS russian_description,
				(COALESCE(NULLIF(btrim(english_tooltip.plain_text),''),'')<>'' OR
					COALESCE(jsonb_array_length(english_tooltip.blocks),0)>0) AS english_tooltip_present,
				(COALESCE(NULLIF(btrim(russian_tooltip.plain_text),''),'')<>'' OR
					COALESCE(jsonb_array_length(russian_tooltip.blocks),0)>0) AS russian_tooltip_present
			FROM current_versions current
			LEFT JOIN game_entity_localizations english
				ON english.version_id=current.version_id AND english.locale='en_US'
			LEFT JOIN game_entity_localizations russian
				ON russian.version_id=current.version_id AND russian.locale='ru_RU'
			LEFT JOIN catalog_entity_tooltips english_tooltip
				ON english_tooltip.version_id=current.version_id AND english_tooltip.locale='en_US'
			LEFT JOIN catalog_entity_tooltips russian_tooltip
				ON russian_tooltip.version_id=current.version_id AND russian_tooltip.locale='ru_RU'
		)
		SELECT
			count(*) FILTER (WHERE btrim(english_name)=''),
			count(*) FILTER (WHERE btrim(russian_name)=''),
			count(*) FILTER (WHERE (entity_type='quest' AND btrim(english_description)='') OR
				(entity_type IN ('item','spell') AND btrim(english_description)='' AND NOT english_tooltip_present)),
			count(*) FILTER (WHERE (entity_type='quest' AND btrim(russian_description)='') OR
				(entity_type IN ('item','spell') AND btrim(russian_description)='' AND NOT russian_tooltip_present))
		FROM localized`, product).Scan(
		&missingEnglishNames, &missingRussianNames,
		&missingEnglishDescriptions, &missingRussianDescriptions); err != nil {
		return ReadinessReport{}, fmt.Errorf("check required localized catalog fields: %w", err)
	}
	report.add("required_english_names", ScopeProduction, missingEnglishNames != 0, missingEnglishNames,
		"every current catalog entity must have a non-empty English name")
	report.add("required_russian_names", ScopeProduction, missingRussianNames != 0, missingRussianNames,
		"every current catalog entity must have a non-empty Russian name or an explicit English fallback")
	report.add("required_english_descriptions", ScopeProduction, missingEnglishDescriptions != 0, missingEnglishDescriptions,
		"items and spells must have an English description or tooltip; quests require an English description before public publication")
	report.add("required_russian_descriptions", ScopeProduction, missingRussianDescriptions != 0, missingRussianDescriptions,
		"items and spells must have a Russian description or tooltip; quests require a Russian description or an explicit English fallback")

	var unresolvedTooltipTemplates int64
	if err := db.QueryRow(ctx, `
		SELECT count(*)
		FROM catalog_entity_tooltips tooltip
		JOIN game_entity_versions version ON version.id=tooltip.version_id
		JOIN game_entities entity ON entity.id=version.entity_id
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL
		  AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
		       OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])')`, product).
		Scan(&unresolvedTooltipTemplates); err != nil {
		return ReadinessReport{}, fmt.Errorf("check unresolved tooltip templates: %w", err)
	}
	report.add("tooltip_template_tokens", ScopeProduction, unresolvedTooltipTemplates != 0, unresolvedTooltipTemplates,
		"generated tooltip projections still contain unresolved Blizzard template tokens; public publication waits for build-pinned resolution")

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

	// Media downloads are deliberately asynchronous and a transient CDN error
	// must not invalidate an otherwise source-complete release. Expose the
	// backlog explicitly, however, so the admin panel cannot claim that every
	// image is healthy while the cache worker still has work to retry.
	var failedMedia, remoteMedia, optionalFailedMedia, optionalRemoteMedia int64
	if err := db.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE media.cache_status='failed' AND media.media_kind='icon' AND media.is_primary),
			count(*) FILTER (WHERE media.cache_status='remote' AND media.media_kind='icon' AND media.is_primary),
			count(*) FILTER (WHERE media.cache_status='failed' AND NOT (media.media_kind='icon' AND media.is_primary)),
			count(*) FILTER (WHERE media.cache_status='remote' AND NOT (media.media_kind='icon' AND media.is_primary))
		FROM catalog_entity_media media
		JOIN game_entities entity ON entity.id=media.entity_id
		JOIN game_entity_versions selected ON selected.id=COALESCE(entity.latest_version_id,entity.published_version_id)
		JOIN game_builds selected_build ON selected_build.id=selected.build_id
		JOIN game_builds media_build ON media_build.id=media.build_id
		WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND entity.deleted_at IS NULL AND media_build.product_id=entity.product_id
		  AND media_build.build_number<=selected_build.build_number`, product).
		Scan(&failedMedia, &remoteMedia, &optionalFailedMedia, &optionalRemoteMedia); err != nil {
		return ReadinessReport{}, fmt.Errorf("check media cache backlog: %w", err)
	}
	report.add("media_cache_backlog", ScopeProduction, failedMedia+remoteMedia != 0, failedMedia+remoteMedia,
		fmt.Sprintf("%d primary icons failed and %d remain remote; public publication waits for verified local media", failedMedia, remoteMedia))
	report.warn("optional_media_cache_backlog", ScopeData, optionalFailedMedia+optionalRemoteMedia,
		fmt.Sprintf("%d optional media assets failed and %d remain remote; tile/zoom media continues retrying without blocking the release", optionalFailedMedia, optionalRemoteMedia))

	// The backlog query above only sees media rows that already exist.  A fresh
	// candidate can otherwise publish with no media observation at all, leaving
	// the UI to render a generic database glyph.  Count missing primary icons
	// against the current (candidate when present) version and keep this check
	// production-blocking.  The media worker is able to seed these rows before
	// the release is published; a missing source therefore remains visible as a
	// real publication failure instead of being silently accepted.
	var missingPrimaryMedia int64
	if err := db.QueryRow(ctx, `
		WITH candidates AS MATERIALIZED (
			SELECT entity.id,entity.entity_type
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			WHERE entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			  AND entity.deleted_at IS NULL
			  AND entity.entity_type IN (
				'item','spell','currency','mount','battle_pet','achievement','toy',
				'class','specialization','profession','talent','pvp_talent'
			  )
		), cached AS MATERIALIZED (
			SELECT DISTINCT media.entity_id
			FROM catalog_entity_media media
			JOIN candidates candidate ON candidate.id=media.entity_id
			WHERE media.media_kind='icon' AND media.is_primary
			  AND media.cache_status='cached'
			  AND NULLIF(media.cached_url,'') IS NOT NULL
			  AND media.cached_content_hash IS NOT NULL
			  AND media.cached_byte_size IS NOT NULL
		)
		SELECT count(*) FROM candidates candidate
		WHERE NOT EXISTS (SELECT 1 FROM cached WHERE cached.entity_id=candidate.id)`, product).
		Scan(&missingPrimaryMedia); err != nil {
		return ReadinessReport{}, fmt.Errorf("check missing primary media: %w", err)
	}
	report.add("required_primary_media", ScopeProduction, missingPrimaryMedia != 0, missingPrimaryMedia,
		"every item, spell and other icon-bearing entity must have a verified cached primary image")

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
		WITH active_profile AS (
			SELECT profile.*
			FROM catalog_release_profiles profile
			JOIN game_products product ON product.id=profile.product_id
			WHERE product.slug=$2 AND profile.status='active'
			ORDER BY profile.profile_key LIMIT 1
		), required_sources AS (
			SELECT unnest(profile.publication_sources) AS source
			FROM active_profile profile
		), used_sources AS (
			SELECT DISTINCT artifact.source
			FROM catalog_source_artifacts artifact
			WHERE artifact.build_id=$1 AND artifact.status IN ('ready','sampled')
			UNION SELECT source FROM required_sources
		)
		SELECT count(*)
		FROM used_sources used
		LEFT JOIN catalog_source_policies policy ON policy.source=used.source
		WHERE policy.source IS NULL OR policy.review_status<>'reviewed'
		   OR policy.public_api_status NOT IN ('allowed','restricted','permission_required')
		   OR policy.commercial_use_status NOT IN ('allowed','restricted','permission_required')`, report.BuildID, product).Scan(&blockedSources); err != nil {
		return ReadinessReport{}, fmt.Errorf("check source publication policy: %w", err)
	}
	report.add("source_publication_policy", ScopeProduction, blockedSources != 0, blockedSources,
		"used sources without a reviewed, publication-compatible policy")

	blockedPublicAPIGrants, err := countBlockedProductionPublicAPIGrants(ctx, db, report.BuildID, product)
	if err != nil {
		return ReadinessReport{}, err
	}
	report.add("production_public_api_grants", ScopeProduction, blockedPublicAPIGrants != 0, blockedPublicAPIGrants,
		"used sources without an active explicit production public-API grant")

	blockedAssetCacheGrants, err := countBlockedProductionAssetCacheGrants(ctx, db, report.BuildID)
	if err != nil {
		return ReadinessReport{}, err
	}
	report.add("production_asset_cache_grants", ScopeProduction, blockedAssetCacheGrants != 0, blockedAssetCacheGrants,
		"media sources without an active explicit production asset-cache grant")

	var verifiedBackups int64
	if err := db.QueryRow(ctx, `
		SELECT count(*) FROM catalog_backup_manifests manifest
		WHERE manifest.component='postgres' AND manifest.status='verified'
		  AND manifest.storage_uri ~ $2
		  AND manifest.database_version=(
			SELECT max(version_id) FROM goose_db_version WHERE is_applied
		  )
		  AND manifest.content_hash IS NOT NULL AND manifest.byte_size>0
		  AND manifest.restore_completed_at>=now()-interval '24 hours'
		  AND manifest.verification @> '{"restore_verified":true,"source_restore_match":true}'::jsonb
		  AND (manifest.product_id IS NULL OR manifest.product_id=(SELECT id FROM game_products WHERE slug=$1))`, product, storagePattern).
		Scan(&verifiedBackups); err != nil {
		return ReadinessReport{}, fmt.Errorf("check recovery evidence: %w", err)
	}
	report.add(recoveryKey, ScopeProduction, verifiedBackups == 0, verifiedBackups, recoveryMessage)

	return report, nil
}

func countBlockedProductionPublicAPIGrants(
	ctx context.Context,
	db *pgxpool.Pool,
	buildID int64,
	product string,
) (int64, error) {
	var blocked int64
	if err := db.QueryRow(ctx, `
		WITH active_profile AS (
			SELECT profile.*
			FROM catalog_release_profiles profile
			JOIN game_products product ON product.id=profile.product_id
			WHERE product.slug=$2 AND profile.status='active'
			ORDER BY profile.profile_key LIMIT 1
		), required_sources AS (
			SELECT unnest(profile.publication_sources) AS source
			FROM active_profile profile
		), used_sources AS (
			SELECT DISTINCT artifact.source
			FROM catalog_source_artifacts artifact
			WHERE artifact.build_id=$1 AND artifact.status IN ('ready','sampled')
			UNION SELECT source FROM required_sources
		)
		SELECT count(*)
		FROM used_sources used
		LEFT JOIN catalog_publication_grants permission ON permission.source=used.source
			AND permission.environment='production' AND permission.surface='public_api'
		LEFT JOIN catalog_source_policy_reviews review ON review.id=permission.policy_review_id
		WHERE permission.decision IS DISTINCT FROM 'allowed'
		   OR permission.expires_at IS NOT NULL AND permission.expires_at<=now()
		   OR review.id IS NULL OR review.source<>used.source
		   OR review.environment<>'production' OR review.surface<>'public_api'
		   OR review.decision<>'allowed' OR review.review_kind NOT IN ('owner_approval','legal')
		   OR review.expires_at IS NOT NULL AND review.expires_at<=now()`, buildID, product).
		Scan(&blocked); err != nil {
		return 0, fmt.Errorf("check production public API grants: %w", err)
	}
	return blocked, nil
}

func countBlockedProductionAssetCacheGrants(
	ctx context.Context,
	db *pgxpool.Pool,
	buildID int64,
) (int64, error) {
	var blocked int64
	if err := db.QueryRow(ctx, `
		WITH media_sources AS (
			SELECT DISTINCT media.source
			FROM catalog_entity_media media
			JOIN game_builds source_build ON source_build.id=media.build_id
			JOIN game_builds target_build ON target_build.id=$1
			WHERE source_build.product_id=target_build.product_id
			  AND source_build.build_number<=target_build.build_number
		)
		SELECT count(*)
		FROM media_sources source
		LEFT JOIN catalog_publication_grants permission ON permission.source=source.source
			AND permission.environment='production' AND permission.surface='asset_cache'
		LEFT JOIN catalog_source_policy_reviews review ON review.id=permission.policy_review_id
		WHERE permission.decision IS DISTINCT FROM 'allowed'
		   OR permission.expires_at IS NOT NULL AND permission.expires_at<=now()
		   OR review.id IS NULL OR review.source<>source.source
		   OR review.environment<>'production' OR review.surface<>'asset_cache'
		   OR review.decision<>'allowed' OR review.review_kind NOT IN ('owner_approval','legal')
		   OR review.expires_at IS NOT NULL AND review.expires_at<=now()`, buildID).
		Scan(&blocked); err != nil {
		return 0, fmt.Errorf("check production asset-cache grants: %w", err)
	}
	return blocked, nil
}

func RecoveryPolicySettings(policy string) (storagePattern, checkKey, message string, err error) {
	switch strings.TrimSpace(strings.ToLower(policy)) {
	case "", RecoveryPolicyOffHost:
		return `^(s3|r2|swift)://`, "off_host_restore_proof", "recent verified off-host backup and restore proof", nil
	case RecoveryPolicyVerifiedSameHost:
		return `^(file|s3|r2|swift)://`, "verified_restore_proof", "recent verified backup and exact restore proof; same-host storage accepts host-loss risk", nil
	default:
		return "", "", "", fmt.Errorf("unsupported recovery policy %q", policy)
	}
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
