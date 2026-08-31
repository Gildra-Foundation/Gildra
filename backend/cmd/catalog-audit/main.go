package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
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
	GeneratedAt time.Time                      `json:"generatedAt"`
	Build       buildReport                    `json:"build"`
	Coverage    []coverageReport               `json:"coverage"`
	Facts       factReport                     `json:"facts"`
	Imports     importReport                   `json:"imports"`
	Readiness   catalogquality.ReadinessReport `json:"readiness"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, product, recoveryPolicy string
	var requireProductionReady, requireDataReady bool
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&product, "product", "wow", "game product slug")
	flag.StringVar(&recoveryPolicy, "recovery-policy", catalogquality.RecoveryPolicyOffHost, "off_host or verified_same_host")
	flag.BoolVar(&requireProductionReady, "require-production-ready", false, "exit non-zero unless every data and production readiness check passes")
	flag.BoolVar(&requireDataReady, "require-data-ready", false, "exit non-zero unless every catalog data-readiness check passes")
	flag.Parse()
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
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
		SELECT count(*) FILTER (WHERE run.status='RUNNING'),count(*) FILTER (WHERE run.status='FAILED')
		FROM catalog_import_runs run
		JOIN game_products product ON product.id=run.product_id
		WHERE product.slug=$1`, product).Scan(&result.Imports.Running, &result.Imports.Failed); err != nil {
		return fmt.Errorf("query import state: %w", err)
	}
	result.Readiness, err = catalogquality.EvaluateReadinessWithRecoveryPolicy(ctx, db, product, result.Build.Version, recoveryPolicy)
	if err != nil {
		return fmt.Errorf("evaluate catalog readiness: %w", err)
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode audit report: %w", err)
	}
	if err := enforceReadiness(result.Readiness, requireDataReady, requireProductionReady); err != nil {
		return err
	}
	return nil
}

func enforceReadiness(readiness catalogquality.ReadinessReport, requireDataReady, requireProductionReady bool) error {
	if requireDataReady && !readiness.DataReady {
		return errors.New("catalog data readiness gate failed")
	}
	if requireProductionReady && !readiness.ProductionReady {
		return errors.New("catalog production readiness gate failed")
	}
	return nil
}
