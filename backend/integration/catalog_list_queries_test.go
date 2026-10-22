//go:build integration

package integration

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

// queryCounter counts every statement a pool sends to PostgreSQL.
type queryCounter struct{ queries atomic.Int64 }

func (c *queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	c.queries.Add(1)
	return ctx
}

func (c *queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

// TestCatalogListQueryCountDoesNotGrowWithPageSize guards against the N+1
// that made a 100-entity spell page issue 905 queries: description values and
// tooltip icons must be loaded per page, not per entity.
func TestCatalogListQueryCountDoesNotGrowWithPageSize(t *testing.T) {
	ctx := context.Background()
	databaseURL := migratedCatalogDatabase(t, ctx)
	seedTemplatedSpells(t, ctx, databaseURL, 40)

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	counter := &queryCounter{}
	config.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	service := catalog.NewService(pool)

	queriesFor := func(limit int, locale string) (int64, catalog.Page) {
		t.Helper()
		counter.queries.Store(0)
		page, err := service.List(ctx, catalog.ListParams{Product: "wow", Type: "spell", Locale: locale, Limit: limit})
		if err != nil {
			t.Fatal(err)
		}
		return counter.queries.Load(), page
	}
	for _, locale := range []string{"en_US", "ru_RU"} {
		small, _ := queriesFor(2, locale)
		large, page := queriesFor(40, locale)
		if len(page.Entities) != 40 {
			t.Fatalf("%s: listed %d spells, want 40", locale, len(page.Entities))
		}
		if large > small {
			t.Fatalf("%s: a 40-entity page issued %d queries, a 2-entity page %d; the count must not grow with page size", locale, large, small)
		}
		// count + page + mentions + talent owners + localizations + media +
		// one tooltip icon lookup + description values (2 locales x 4 levels).
		if large > 15 {
			t.Fatalf("%s: a 40-entity page issued %d queries, want at most 15", locale, large)
		}
		for _, entity := range page.Entities {
			if strings.Contains(entity.Description, "$") || strings.Contains(entity.Tooltip.PlainText, "$") {
				t.Fatalf("%s: unresolved template in %q / %q", locale, entity.Description, entity.Tooltip.PlainText)
			}
			for _, block := range entity.Tooltip.Blocks {
				if text, ok := block["text"].(string); ok && strings.Contains(text, "$") {
					t.Fatalf("%s: unresolved tooltip block %q", locale, text)
				}
			}
		}
	}

	counter.queries.Store(0)
	_, page := queriesFor(1, "en_US")
	counter.queries.Store(0)
	entity, err := service.Get(ctx, page.Entities[0].ID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if got := counter.queries.Load(); got > 14 {
		t.Fatalf("detail issued %d queries, want at most 14", got)
	}
	if !strings.Contains(entity.Description, "Fire damage over 10 sec") {
		t.Fatalf("detail description was not resolved: %q", entity.Description)
	}
}

// migratedCatalogDatabase returns a freshly migrated, disposable database.
// GILDRA_INTEGRATION_DATABASE_URL points at a local server where the test
// may create and drop its own database; otherwise a container is started.
func migratedCatalogDatabase(t *testing.T, ctx context.Context) string {
	t.Helper()
	databaseURL := os.Getenv("GILDRA_INTEGRATION_DATABASE_URL")
	if databaseURL != "" {
		databaseURL = createScratchDatabase(t, ctx, databaseURL)
	} else {
		postgres, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
			pgcontainer.WithDatabase("gildra"),
			pgcontainer.WithUsername("gildra"),
			pgcontainer.WithPassword("test-password"),
			pgcontainer.BasicWaitStrategies(),
		)
		if err != nil {
			t.Fatal(err)
		}
		testcontainers.CleanupContainer(t, postgres)
		databaseURL, err = postgres.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			t.Fatal(err)
		}
	}
	migrations, err := filepath.Abs("../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	return databaseURL
}

func createScratchDatabase(t *testing.T, ctx context.Context, serverURL string) string {
	t.Helper()
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "gildra_it_" + hex.EncodeToString(suffix)
	admin, err := pgx.Connect(ctx, serverURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, err := pgx.Connect(context.Background(), serverURL)
		if err != nil {
			t.Error(err)
			return
		}
		defer cleanup.Close(context.Background())
		if _, err := cleanup.Exec(context.Background(), "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
	})
	parsed, err := url.Parse(serverURL)
	if err != nil {
		t.Fatal(err)
	}
	parsed.Path = "/" + name
	return parsed.String()
}

// seedTemplatedSpells publishes spells whose descriptions and tooltip blocks
// reference build-pinned values of the next spells, plus one item each that
// tooltips link to, so every list entity needs description values and icons.
func seedTemplatedSpells(t *testing.T, ctx context.Context, databaseURL string, count int) {
	t.Helper()
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	// One multi-statement script; the count is an int, so formatting it into
	// the text is safe and avoids a prepared statement.
	if _, err := database.ExecContext(ctx, strings.ReplaceAll(`
		CREATE TEMP TABLE seed AS
			SELECT g AS ext, t, gen_random_uuid() AS eid, gen_random_uuid() AS vid
			FROM generate_series(1, {count} + 4) g CROSS JOIN (VALUES ('spell'), ('item')) types(t);
		INSERT INTO game_builds(product_id,build_number,version,is_active)
			SELECT id, 990101, '12.1.0.990101', true FROM game_products WHERE slug='wow';
		INSERT INTO game_entities(id,product_id,entity_type,external_id,canonical_slug)
			SELECT eid, (SELECT id FROM game_products WHERE slug='wow'), t, ext, t || '-' || ext FROM seed;
		INSERT INTO game_entity_versions(id,entity_id,build_id,content_hash,payload,source_url,source)
			SELECT vid, eid, (SELECT id FROM game_builds WHERE build_number=990101), sha256(convert_to(t || ext, 'UTF8')),
				'{}'::jsonb, 'https://example.invalid/' || t || '/' || ext, 'wago_tools' FROM seed;
		UPDATE game_entities e SET latest_version_id=s.vid, published_version_id=s.vid FROM seed s WHERE s.eid=e.id;
		INSERT INTO game_entity_localizations(version_id,locale,name,description)
			SELECT vid, 'en_US', CASE WHEN t='spell' THEN 'Fire Strike ' ELSE 'Ember Blade ' END || ext,
				CASE WHEN t='spell' THEN 'Deals $s1 Fire damage over $d. Also $' || (ext + 1) || 's1 more.' ELSE 'Equip: strength.' END
			FROM seed;
		INSERT INTO game_entity_localizations(version_id,locale,name,description)
			SELECT vid, 'ru_RU', CASE WHEN t='spell' THEN 'Огненный удар ' ELSE 'Клинок углей ' END || ext,
				CASE WHEN t='spell' THEN 'Наносит $s1 ед. урона за $d. Ещё $' || (ext + 2) || 's1 ед.' ELSE 'Сила.' END
			FROM seed;
		INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,blocks,content_hash)
			SELECT s.vid, locale, 'Deals $s1 Fire damage over $d.',
				jsonb_build_array(
					jsonb_build_object('type','effect','text','Heals for $s2.','spell_id',s.ext + 3),
					jsonb_build_object('type','reagent','item_entity_id',item.eid)),
				sha256(convert_to(s.ext || locale, 'UTF8'))
			FROM seed s JOIN seed item ON item.t='item' AND item.ext=s.ext
			CROSS JOIN (VALUES ('en_US'), ('ru_RU')) locales(locale)
			WHERE s.t='spell';
		INSERT INTO catalog_spell_effects(spell_version_id,effect_index,difficulty_id,effect_type,base_points,coefficient,source)
			SELECT vid, effect, 0, 2, 100 + ext + effect, 0.5, 'db2' FROM seed CROSS JOIN generate_series(0, 1) effect WHERE t='spell';
		INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url)
			SELECT (SELECT id FROM game_builds WHERE build_number=990101), 'SpellMisc', 'en_US', ext,
				jsonb_build_object('SpellID', ext::text, 'DurationIndex', '1'), sha256(convert_to('misc' || ext, 'UTF8')), 'test'
			FROM seed WHERE t='spell';
		INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url)
			SELECT id, 'SpellDuration', 'en_US', 1, '{"Duration":"10000","MaxDuration":"10000"}', sha256(convert_to('duration', 'UTF8')), 'test'
			FROM game_builds WHERE build_number=990101;
		ANALYZE;`, "{count}", strconv.Itoa(count))); err != nil {
		t.Fatal(err)
	}
}
