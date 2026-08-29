//go:build live

package catalog

import (
	"context"
	"net/url"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestLiveSpellProjectionIncludesMechanics(t *testing.T) {
	databaseURL := os.Getenv("GILDRA_LIVE_DATABASE_URL")
	if databaseURL == "" && os.Getenv("POSTGRES_PASSWORD") != "" {
		host := os.Getenv("GILDRA_LIVE_POSTGRES_HOST")
		if host == "" {
			host = "postgres:5432"
		}
		databaseURL = (&url.URL{
			Scheme: "postgres",
			User:   url.UserPassword("gildra", os.Getenv("POSTGRES_PASSWORD")),
			Host:   host,
			Path:   "/gildra",
			RawQuery: url.Values{
				"sslmode": []string{"disable"},
			}.Encode(),
		}).String()
	}
	if databaseURL == "" {
		t.Skip("GILDRA_LIVE_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	var id uuid.UUID
	if err := pool.QueryRow(ctx, `
		SELECT entity.id
		FROM game_entities entity
		JOIN game_products product ON product.id=entity.product_id
		WHERE product.slug='wow' AND entity.entity_type='spell' AND entity.external_id=133
		  AND entity.deleted_at IS NULL AND entity.published_version_id IS NOT NULL`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	entity, err := NewService(pool).Get(ctx, id, "ru_RU")
	if err != nil {
		t.Fatal(err)
	}
	if entity.IconName == nil || *entity.IconName != "spell_fire_flamebolt" {
		t.Fatalf("Fireball icon=%v, want spell_fire_flamebolt", entity.IconName)
	}
	for _, block := range entity.Tooltip.Blocks {
		if block["type"] != "spell_info" {
			continue
		}
		if block["school"] != "fire" || block["cast_time_ms"] != float64(1750) || block["max_range"] != float64(40) {
			t.Fatalf("Fireball spell_info=%#v, want fire/1750ms/40yd", block)
		}
		return
	}
	t.Fatalf("Fireball tooltip blocks=%#v, want spell_info", entity.Tooltip.Blocks)
}
