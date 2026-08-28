package catalog

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestClassicPublishedLibraryIntegration(t *testing.T) {
	databaseURL := os.Getenv("CATALOG_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("CATALOG_INTEGRATION_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	service := NewService(db)
	products := []struct {
		slug     string
		minimums map[string]int64
	}{
		{slug: "wow_classic", minimums: map[string]int64{
			"item": 80_000, "spell": 90_000, "creature": 4_000, "recipe": 5_000,
		}},
		{slug: "wow_classic_era", minimums: map[string]int64{
			"item": 24_000, "spell": 31_000, "creature": 600, "recipe": 1_600,
		}},
		{slug: "wow_classic_hardcore", minimums: map[string]int64{
			"item": 24_000, "spell": 31_000, "creature": 600, "recipe": 1_600,
		}},
	}
	for _, product := range products {
		t.Run(product.slug, func(t *testing.T) {
			types, err := service.EntityTypes(ctx, product.slug, "ru_RU")
			if err != nil {
				t.Fatal(err)
			}
			counts := make(map[string]int64, len(types))
			for _, entityType := range types {
				counts[entityType.Type] = entityType.Count
			}
			for entityType, minimum := range product.minimums {
				if counts[entityType] < minimum {
					t.Fatalf("%s %s count = %d, want at least %d", product.slug, entityType, counts[entityType], minimum)
				}
			}

			page, err := service.List(ctx, ListParams{Product: product.slug, Type: "item", Locale: "ru_RU", Limit: 1})
			if err != nil {
				t.Fatal(err)
			}
			if len(page.Entities) != 1 || page.Total < product.minimums["item"] {
				t.Fatalf("unexpected %s item page: entities=%d total=%d", product.slug, len(page.Entities), page.Total)
			}
			entity, err := service.Get(ctx, page.Entities[0].ID, "ru_RU")
			if err != nil {
				t.Fatal(err)
			}
			if entity.Product != product.slug || entity.BuildID == nil || entity.Tooltip == nil || len(entity.Tooltip.Blocks) == 0 {
				t.Fatalf("published %s detail is incomplete: product=%q build=%v tooltip=%v", product.slug, entity.Product, entity.BuildID, entity.Tooltip)
			}
		})
	}
}
