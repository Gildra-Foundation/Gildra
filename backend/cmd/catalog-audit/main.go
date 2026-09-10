package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
	"github.com/jackc/pgx/v5/pgxpool"
)

type buildReport struct {
	ID      int64  `json:"id"`
	Number  int    `json:"number"`
	Version string `json:"version"`
	Active  bool   `json:"active"`
}

type coverageReport struct {
	EntityType                 string `json:"entityType"`
	Entities                   int64  `json:"entities"`
	EnglishNames               int64  `json:"englishNames"`
	RussianNames               int64  `json:"russianNames"`
	EnglishDescribed           int64  `json:"englishDescribed"`
	RussianDescribed           int64  `json:"russianDescribed"`
	EnglishUnresolvedTemplates int64  `json:"englishUnresolvedTemplates"`
	RussianUnresolvedTemplates int64  `json:"russianUnresolvedTemplates"`
	EnglishTooltips            int64  `json:"englishTooltips"`
	RussianTooltips            int64  `json:"russianTooltips"`
	Icons                      int64  `json:"icons"`
	MediaRecords               int64  `json:"mediaRecords"`
	CachedMedia                int64  `json:"cachedMedia"`
	FailedMedia                int64  `json:"failedMedia"`
	OfficialDocs               int64  `json:"officialDocuments"`
}

type factReport struct {
	ItemStats          int64 `json:"itemStats"`
	ItemEffects        int64 `json:"itemEffects"`
	AcquisitionSources int64 `json:"acquisitionSources"`
	SpellEffects       int64 `json:"spellEffects"`
	TalentSpellLinks   int64 `json:"talentSpellLinks"`
	SpellOwners        int64 `json:"spellOwners"`
	ProfessionRecipes  int64 `json:"professionRecipes"`
	RecipeReagents     int64 `json:"recipeReagents"`
	RecipeOutputs      int64 `json:"recipeOutputs"`
}

type importReport struct {
	Running int64 `json:"running"`
	Failed  int64 `json:"failed"`
}

type report struct {
	GeneratedAt  time.Time                            `json:"generatedAt"`
	Build        buildReport                          `json:"build"`
	Coverage     []coverageReport                     `json:"coverage"`
	Facts        factReport                           `json:"facts"`
	Imports      importReport                         `json:"imports"`
	Quality      catalogquality.PublicQualitySnapshot `json:"quality"`
	Readiness    catalogquality.ReadinessReport       `json:"readiness"`
	RuntimeProbe runtimeTemplateProbeReport           `json:"runtimeTemplateProbe,omitempty"`
}

type runtimeTemplateProbeRecord struct {
	ID         string
	EntityType string
	ExternalID int64
}

type runtimeTemplateProbeReport struct {
	Records          int      `json:"records"`
	Requests         int      `json:"requests"`
	RawTokenPayloads int64    `json:"rawTokenPayloads"`
	FallbackPayloads int64    `json:"fallbackPayloads"`
	Failures         []string `json:"failures,omitempty"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, product, recoveryPolicy, buildVersion, qualityProfile, apiBaseURL string
	var requireProductionReady, requireDataReady, requirePublicQuality, enforcePublicQuality bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&product, "product", "wow", "game product slug")
	flag.StringVar(&buildVersion, "build", "", "audit readiness of this staged build version instead of the active build")
	flag.StringVar(&qualityProfile, "quality-profile", catalogquality.QualityProfileMidnightActive, "scoped public quality profile (default: midnight-active)")
	flag.StringVar(&recoveryPolicy, "recovery-policy", catalogquality.RecoveryPolicyOffHost, "off_host or verified_same_host")
	flag.BoolVar(&requireProductionReady, "require-production-ready", false, "exit non-zero unless every data and production readiness check passes")
	flag.BoolVar(&requireDataReady, "require-data-ready", false, "exit non-zero unless every catalog data-readiness check passes")
	flag.BoolVar(&requirePublicQuality, "require-public-quality", false, "exit non-zero unless the scoped public quality profile and its runtime probe pass")
	flag.BoolVar(&enforcePublicQuality, "enforce-public-quality", false, "treat scoped public-quality failures as production-readiness blockers")
	flag.StringVar(&apiBaseURL, "api-base-url", "http://127.0.0.1:8080", "public API base URL used by the enforced runtime template probe")
	flag.DurationVar(&timeout, "timeout", 15*time.Minute, "maximum time allowed for the complete audit")
	flag.Parse()
	if timeout <= 0 {
		return errors.New("-timeout must be greater than zero")
	}
	// A required public gate always evaluates the scoped profile and the live
	// template probe. It deliberately does not turn unrelated historical
	// data-readiness findings into deployment blockers.
	if requirePublicQuality {
		enforcePublicQuality = true
	}
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}

	// Coverage and normalized-fact checks intentionally scan the published
	// projection.  On the production-sized database these are bounded by the
	// audit timeout rather than the short request deadlines used by the API.
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping catalog database: %w", err)
	}

	result := report{GeneratedAt: time.Now().UTC(), Coverage: make([]coverageReport, 0)}
	if err := db.QueryRow(ctx, `
		SELECT build.id,build.build_number,build.version,build.is_active
		FROM game_builds build
		JOIN game_products product ON product.id=build.product_id
		WHERE product.slug=$1
		ORDER BY build.is_active DESC,build.build_number DESC
		LIMIT 1`, product).Scan(&result.Build.ID, &result.Build.Number, &result.Build.Version, &result.Build.Active); err != nil {
		return fmt.Errorf("find current build: %w", err)
	}

	// Audit the published projection, not the latest staging version.  A fresh
	// import may legitimately have a newer latest_version_id while the public
	// library still serves the previous atomically published version.
	// Keep the wide coverage aggregation deterministic on small production
	// hosts where PostgreSQL's parallel workers can exhaust the container's
	// shared-memory budget.
	if _, err := db.Exec(ctx, `SET max_parallel_workers_per_gather=0`); err != nil {
		return fmt.Errorf("configure coverage query: %w", err)
	}
	rows, err := db.Query(ctx, `
		WITH official AS (
			SELECT document.entity_type,document.external_id,count(*) AS document_count
			FROM catalog_entity_source_documents document
			JOIN game_builds source_build ON source_build.id=document.build_id
			JOIN game_builds target_build ON target_build.id=$1
			WHERE document.source='blizzard_api'
			  AND source_build.product_id=target_build.product_id
			  AND source_build.build_number<=target_build.build_number
			GROUP BY document.entity_type,document.external_id
		), media AS (
			SELECT entity.entity_type,
				count(media.id) AS media_records,
				count(media.id) FILTER (WHERE media.cache_status='cached'
					AND NULLIF(media.cached_url,'') IS NOT NULL
					AND media.cached_content_hash IS NOT NULL
					AND media.cached_byte_size IS NOT NULL) AS cached_media,
				count(media.id) FILTER (WHERE media.cache_status='failed') AS failed_media
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.published_version_id
			LEFT JOIN catalog_entity_media media ON media.entity_id=entity.id
				AND media.build_id=version.build_id
			WHERE entity.product_id=(SELECT product.id FROM game_products product WHERE product.slug=$2)
			  AND entity.deleted_at IS NULL
			GROUP BY entity.entity_type
		)
		SELECT entity.entity_type,count(*),
			count(*) FILTER (WHERE NULLIF(BTRIM(en.name),'') IS NOT NULL),
			count(*) FILTER (WHERE NULLIF(BTRIM(ru.name),'') IS NOT NULL),
			count(*) FILTER (WHERE NULLIF(BTRIM(en.description),'') IS NOT NULL),
			count(*) FILTER (WHERE NULLIF(BTRIM(ru.description),'') IS NOT NULL),
			count(*) FILTER (WHERE en.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'),
			count(*) FILTER (WHERE ru.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'),
			count(*) FILTER (WHERE EXISTS (
				SELECT 1 FROM catalog_entity_tooltips tooltip
				WHERE tooltip.version_id=version.id AND tooltip.locale='en_US'
				  AND (NULLIF(BTRIM(tooltip.plain_text),'') IS NOT NULL OR jsonb_array_length(tooltip.blocks)>0)
			)),
			count(*) FILTER (WHERE EXISTS (
				SELECT 1 FROM catalog_entity_tooltips tooltip
				WHERE tooltip.version_id=version.id AND tooltip.locale='ru_RU'
				  AND (NULLIF(BTRIM(tooltip.plain_text),'') IS NOT NULL OR jsonb_array_length(tooltip.blocks)>0)
			)),
			count(*) FILTER (WHERE icon.external_id IS NOT NULL),
			MAX(COALESCE(media.media_records,0)),MAX(COALESCE(media.cached_media,0)),MAX(COALESCE(media.failed_media,0)),
			count(*) FILTER (WHERE official.external_id IS NOT NULL)
		FROM game_entities entity
		JOIN game_products product ON product.id=entity.product_id AND product.slug=$2
		JOIN game_entity_versions version ON version.id=entity.published_version_id
		LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
		LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
		LEFT JOIN catalog_entity_icons icon ON icon.build_id=version.build_id
			AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id
		LEFT JOIN official ON official.entity_type=entity.entity_type AND official.external_id=entity.external_id
		LEFT JOIN media ON media.entity_type=entity.entity_type
		WHERE entity.deleted_at IS NULL
		GROUP BY entity.entity_type
		ORDER BY entity.entity_type`, result.Build.ID, product)
	if err != nil {
		return fmt.Errorf("query catalog coverage: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var item coverageReport
		if err := rows.Scan(&item.EntityType, &item.Entities, &item.EnglishNames, &item.RussianNames,
			&item.EnglishDescribed, &item.RussianDescribed, &item.EnglishUnresolvedTemplates,
			&item.RussianUnresolvedTemplates, &item.EnglishTooltips, &item.RussianTooltips,
			&item.Icons, &item.MediaRecords, &item.CachedMedia, &item.FailedMedia, &item.OfficialDocs); err != nil {
			return fmt.Errorf("scan catalog coverage: %w", err)
		}
		result.Coverage = append(result.Coverage, item)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read catalog coverage: %w", err)
	}

	factTx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin normalized facts query: %w", err)
	}
	defer factTx.Rollback(ctx)
	if _, err := factTx.Exec(ctx, `SET LOCAL max_parallel_workers_per_gather=0`); err != nil {
		return fmt.Errorf("configure normalized facts query: %w", err)
	}
	if err := factTx.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM catalog_item_stats fact
				JOIN game_entity_versions version ON version.id=fact.version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_item_effects fact
				JOIN game_entity_versions version ON version.id=fact.version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_item_acquisition_sources fact
				JOIN game_entity_versions version ON version.id=fact.version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_spell_effects fact
				JOIN game_entity_versions version ON version.id=fact.spell_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_talent_spell_relations fact
				JOIN game_entity_versions version ON version.id=fact.talent_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_spell_owners fact
				JOIN game_entity_versions version ON version.id=fact.spell_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_profession_recipes fact
				JOIN game_entity_versions version ON version.id=fact.profession_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_recipe_reagents fact
				JOIN game_entity_versions version ON version.id=fact.recipe_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL),
			(SELECT count(*) FROM catalog_recipe_outputs fact
				JOIN game_entity_versions version ON version.id=fact.recipe_version_id AND version.build_id=$1
				JOIN game_entities entity ON entity.id=version.entity_id AND entity.product_id=(SELECT id FROM game_products WHERE slug=$2) AND entity.deleted_at IS NULL)`, result.Build.ID, product).Scan(
		&result.Facts.ItemStats, &result.Facts.ItemEffects, &result.Facts.AcquisitionSources,
		&result.Facts.SpellEffects, &result.Facts.TalentSpellLinks, &result.Facts.SpellOwners,
		&result.Facts.ProfessionRecipes, &result.Facts.RecipeReagents, &result.Facts.RecipeOutputs,
	); err != nil {
		return fmt.Errorf("query normalized facts: %w", err)
	}
	if err := factTx.Commit(ctx); err != nil {
		return fmt.Errorf("commit normalized facts query: %w", err)
	}

	if err := db.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE run.status='RUNNING'),
			count(*) FILTER (WHERE run.status='FAILED' AND COALESCE(queue.state,'quarantined')<>'resolved')
		FROM catalog_import_runs run
		JOIN game_products product ON product.id=run.product_id
		LEFT JOIN catalog_import_failure_queue queue ON queue.import_run_id=run.id
		WHERE product.slug=$1`, product).Scan(&result.Imports.Running, &result.Imports.Failed); err != nil {
		return fmt.Errorf("query import state: %w", err)
	}
	auditBuild := result.Build.Version
	if buildVersion != "" {
		// A staged (not yet active) build can be audited before publication.
		auditBuild = buildVersion
	}
	result.Quality, err = catalogquality.EvaluatePublicQuality(ctx, db, product, auditBuild, qualityProfile)
	if err != nil {
		return fmt.Errorf("evaluate public quality profile: %w", err)
	}
	result.Readiness, err = catalogquality.EvaluateReadinessWithRecoveryPolicy(ctx, db, product, auditBuild, recoveryPolicy)
	if err != nil {
		return fmt.Errorf("evaluate catalog readiness: %w", err)
	}
	// The report is always produced. Enforcement is opt-in until the selected
	// cohort has been backfilled; otherwise a safety-only release would be
	// unable to deploy precisely because it exposes the existing data gaps.
	if enforcePublicQuality {
		catalogquality.ApplyPublicQualityGate(&result.Readiness, result.Quality)
		result.RuntimeProbe, err = runRuntimeTemplateProbe(ctx, db, product, auditBuild, apiBaseURL)
		if err != nil {
			return fmt.Errorf("run public runtime template probe: %w", err)
		}
		probeFailures := int64(len(result.RuntimeProbe.Failures))
		result.Readiness.AddProductionCheck("public_runtime_template_probe", probeFailures, probeFailures != 0,
			"every eligible Midnight template record must render without raw tokens or sanitizer fallback phrases")
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode audit report: %w", err)
	}
	if err := enforceReadiness(result.Readiness, requireDataReady, requireProductionReady, requirePublicQuality); err != nil {
		return err
	}
	return nil
}

func enforceReadiness(readiness catalogquality.ReadinessReport, requireDataReady, requireProductionReady, requirePublicQuality bool) error {
	if requireDataReady && !readiness.DataReady {
		return errors.New("catalog data readiness gate failed")
	}
	if requireProductionReady && !readiness.ProductionReady {
		return errors.New("catalog production readiness gate failed")
	}
	if requirePublicQuality && !catalogquality.PublicQualityReady(readiness) {
		return errors.New("catalog public quality gate failed")
	}
	return nil
}

func runRuntimeTemplateProbe(ctx context.Context, db *pgxpool.Pool, product, build, baseURL string) (runtimeTemplateProbeReport, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	parsed, err := url.ParseRequestURI(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return runtimeTemplateProbeReport{}, fmt.Errorf("invalid -api-base-url %q", baseURL)
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1")) {
		return runtimeTemplateProbeReport{}, errors.New("-api-base-url must use HTTPS, except loopback HTTP")
	}
	rows, err := db.Query(ctx, `
		SELECT DISTINCT entity.id::text,entity.entity_type,entity.external_id
		FROM catalog_entity_expansions cohort
		JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id AND expansion.expansion_key='midnight'
		JOIN game_products product_row ON product_row.id=cohort.product_id AND product_row.slug=$1
		JOIN game_builds build_row ON build_row.id=cohort.build_id AND build_row.version=$2
		JOIN game_entities entity ON entity.product_id=cohort.product_id AND entity.entity_type=cohort.entity_type
			AND entity.external_id=cohort.external_id AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.published_version_id AND version.build_id=cohort.build_id
		JOIN catalog_entity_usability usability ON usability.product_id=cohort.product_id AND usability.build_id=cohort.build_id
			AND usability.entity_type=cohort.entity_type AND usability.external_id=cohort.external_id AND usability.decision='eligible'
		WHERE cohort.classification='confirmed'
		  AND (EXISTS (SELECT 1 FROM game_entity_localizations localization WHERE localization.version_id=version.id
			AND localization.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])')
		    OR EXISTS (SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=version.id
			AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])' OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])')))
		ORDER BY entity.entity_type,entity.external_id`, product, build)
	if err != nil {
		return runtimeTemplateProbeReport{}, fmt.Errorf("select runtime template records: %w", err)
	}
	defer rows.Close()
	records := make([]runtimeTemplateProbeRecord, 0)
	for rows.Next() {
		var item runtimeTemplateProbeRecord
		if err := rows.Scan(&item.ID, &item.EntityType, &item.ExternalID); err != nil {
			return runtimeTemplateProbeReport{}, err
		}
		records = append(records, item)
	}
	if err := rows.Err(); err != nil {
		return runtimeTemplateProbeReport{}, err
	}
	result := runtimeTemplateProbeReport{Records: len(records), Failures: make([]string, 0)}
	client := &http.Client{Timeout: 20 * time.Second}
	for _, item := range records {
		for _, locale := range []string{"en_US", "ru_RU"} {
			result.Requests++
			request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/v1/game/entities/"+url.PathEscape(item.ID)+"?locale="+url.QueryEscape(locale), nil)
			if err != nil {
				result.Failures = append(result.Failures, fmt.Sprintf("%s/%d %s: %v", item.EntityType, item.ExternalID, locale, err))
				continue
			}
			response, err := client.Do(request)
			if err != nil {
				result.Failures = append(result.Failures, fmt.Sprintf("%s/%d %s: %v", item.EntityType, item.ExternalID, locale, err))
				continue
			}
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 8<<20))
			response.Body.Close()
			if response.StatusCode != http.StatusOK || readErr != nil {
				result.Failures = append(result.Failures, fmt.Sprintf("%s/%d %s: HTTP %d", item.EntityType, item.ExternalID, locale, response.StatusCode))
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				result.Failures = append(result.Failures, fmt.Sprintf("%s/%d %s: invalid JSON: %v", item.EntityType, item.ExternalID, locale, err))
				continue
			}
			validation := catalogquality.ValidatePublicTemplatePayload(payload)
			if validation.RawTokens > 0 {
				result.RawTokenPayloads++
			}
			if validation.FallbackPhrases > 0 {
				result.FallbackPayloads++
			}
			if validation.RawTokens > 0 || validation.FallbackPhrases > 0 {
				result.Failures = append(result.Failures, fmt.Sprintf("%s/%d %s: raw_tokens=%d fallback_phrases=%d", item.EntityType, item.ExternalID, locale, validation.RawTokens, validation.FallbackPhrases))
			}
		}
	}
	return result, nil
}
