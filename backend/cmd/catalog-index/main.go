package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogtaxonomy"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		slog.Error("catalog index stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL string
	var confirm bool
	var tooltipsOnly bool
	var itemsOnly bool
	var itemsTaxonomyOnly bool
	var variantsOnly bool
	var descriptionsOnly bool
	var taxonomyOnly bool
	var racesOnly bool
	var classesOnly bool
	var professionsOnly bool
	var talentsOnly bool
	var pvpTalentsOnly bool
	var spellEffectsOnly bool
	var graphOnly bool
	var statsOnly bool
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.BoolVar(&confirm, "confirm", false, "rebuild taxonomy and tooltips")
	flag.BoolVar(&tooltipsOnly, "tooltips-only", false, "rebuild tooltip projections without taxonomy")
	flag.BoolVar(&itemsOnly, "items-only", false, "rebuild item taxonomy and tooltip projections")
	flag.BoolVar(&itemsTaxonomyOnly, "items-taxonomy-only", false, "rebuild item taxonomy without tooltip projections")
	flag.BoolVar(&variantsOnly, "variants-only", false, "rebuild canonical item variants and normalized scaling stats only")
	flag.BoolVar(&descriptionsOnly, "descriptions-only", false, "fill canonical cross-entity descriptions without downloading source data")
	flag.BoolVar(&taxonomyOnly, "taxonomy-only", false, "rebuild taxonomy without tooltip projections")
	flag.BoolVar(&racesOnly, "races-only", false, "rebuild spell race taxonomy only")
	flag.BoolVar(&classesOnly, "classes-only", false, "rebuild spell class taxonomy only")
	flag.BoolVar(&professionsOnly, "professions-only", false, "rebuild profession recipe taxonomy only")
	flag.BoolVar(&talentsOnly, "talents-only", false, "rebuild talent relationships and tooltip projections only")
	flag.BoolVar(&pvpTalentsOnly, "pvp-talents-only", false, "rebuild PvP talent taxonomy, relationships, and tooltips")
	flag.BoolVar(&spellEffectsOnly, "spell-effects-only", false, "rebuild normalized DB2 spell effects only")
	flag.BoolVar(&graphOnly, "graph-only", false, "rebuild normalized entity relationships only")
	flag.BoolVar(&statsOnly, "stats-only", false, "refresh cached catalog counts and coverage only")
	flag.Parse()
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping catalog database: %w", err)
	}
	if !confirm {
		var items, trees int64
		if err := db.QueryRow(ctx, `SELECT count(*) FILTER (WHERE entity_type='item'), count(*) FILTER (WHERE entity_type='talent_tree') FROM game_entities WHERE deleted_at IS NULL`).Scan(&items, &trees); err != nil {
			return fmt.Errorf("inspect catalog: %w", err)
		}
		return printJSON(map[string]any{"dry_run": true, "items": items, "talent_trees": trees})
	}
	indexer := catalogtaxonomy.New(db)
	var result catalogtaxonomy.Result
	selectedModes := 0
	for _, selected := range []bool{tooltipsOnly, itemsOnly, itemsTaxonomyOnly, variantsOnly, descriptionsOnly, taxonomyOnly, racesOnly, classesOnly, professionsOnly, talentsOnly, pvpTalentsOnly, spellEffectsOnly, graphOnly, statsOnly} {
		if selected {
			selectedModes++
		}
	}
	if selectedModes > 1 {
		return errors.New("index rebuild modes are mutually exclusive")
	}
	if statsOnly {
		if err := catalog.NewService(db).RefreshReadModels(ctx, nil); err != nil {
			return err
		}
	} else if tooltipsOnly {
		result, err = indexer.RebuildTooltips(ctx)
	} else if itemsOnly {
		result, err = indexer.RebuildItemsAndTooltips(ctx)
	} else if itemsTaxonomyOnly {
		result, err = indexer.RebuildItemTaxonomy(ctx)
	} else if variantsOnly {
		result, err = indexer.RebuildItemVariants(ctx)
	} else if descriptionsOnly {
		result, err = indexer.RebuildDescriptions(ctx)
	} else if taxonomyOnly {
		result, err = indexer.RebuildTaxonomy(ctx)
	} else if racesOnly {
		result, err = indexer.RebuildRaces(ctx)
	} else if classesOnly {
		result, err = indexer.RebuildSpellClasses(ctx)
	} else if professionsOnly {
		result, err = indexer.RebuildProfessionRecipes(ctx)
	} else if talentsOnly {
		result, err = indexer.RebuildTalentTooltips(ctx)
	} else if pvpTalentsOnly {
		result, err = indexer.RebuildPvpTalents(ctx)
	} else if spellEffectsOnly {
		result, err = indexer.RebuildSpellEffects(ctx)
	} else if graphOnly {
		result, err = indexer.RebuildGraph(ctx)
	} else {
		result, err = indexer.Rebuild(ctx)
	}
	if err != nil {
		return err
	}
	if !statsOnly {
		if err := catalog.NewService(db).RefreshReadModels(ctx, nil); err != nil {
			return err
		}
	}
	projector := "catalog_index_full"
	switch {
	case tooltipsOnly:
		projector = "catalog_tooltips"
	case variantsOnly:
		projector = "catalog_item_variants"
	case descriptionsOnly:
		projector = "catalog_descriptions"
	case spellEffectsOnly:
		projector = "catalog_spell_effects"
	case graphOnly:
		projector = "catalog_entity_graph"
	case statsOnly:
		projector = "catalog_read_models"
	}
	output := any(result)
	if statsOnly {
		output = map[string]any{"read_models_refreshed": true}
	}
	metadata, _ := json.Marshal(output)
	if _, err := db.Exec(ctx, `
		INSERT INTO catalog_projection_watermarks(product_id,projector,build_id,snapshot_id,status,metadata,started_at,completed_at)
		SELECT product.id,$1,build.id,snapshot.id,'succeeded',$2::jsonb,now(),now()
		FROM game_products product
		JOIN LATERAL (SELECT candidate.id FROM game_builds candidate WHERE candidate.product_id=product.id AND candidate.is_active ORDER BY candidate.build_number DESC LIMIT 1) build ON true
		LEFT JOIN LATERAL (SELECT candidate.id FROM catalog_snapshots candidate WHERE candidate.product_id=product.id AND candidate.build_id=build.id AND candidate.status='published' ORDER BY candidate.published_at DESC NULLS LAST,candidate.created_at DESC LIMIT 1) snapshot ON true
		WHERE product.slug='wow'
		ON CONFLICT(product_id,projector) DO UPDATE SET build_id=EXCLUDED.build_id,snapshot_id=EXCLUDED.snapshot_id,
			status='succeeded',metadata=EXCLUDED.metadata,started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at`, projector, metadata); err != nil {
		return fmt.Errorf("record projection watermark: %w", err)
	}
	return printJSON(output)
}

func printJSON(value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode result: %w", err)
	}
	fmt.Println(string(encoded))
	return nil
}
