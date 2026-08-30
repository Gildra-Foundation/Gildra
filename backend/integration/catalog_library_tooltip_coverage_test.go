//go:build integration

package integration

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// TestLibraryTooltipCoverageUsesPublishedRows protects the distinction between
// dataset membership and an actually materialized localized tooltip.  It runs
// against an isolated Postgres container and never touches a production DB.
func TestLibraryTooltipCoverageUsesPublishedRows(t *testing.T) {
	ctx := context.Background()
	migrations, err := filepath.Abs("../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
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
	postgresURL, err := postgres.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 106); err != nil {
		t.Fatalf("apply migrations before tooltip coverage fix: %v", err)
	}

	var productID int16
	if err := database.QueryRowContext(ctx, `
		SELECT id FROM game_products WHERE slug='wow_classic'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	var buildID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version)
		VALUES($1,990001,'5.5.4.990001')
		RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	var entityID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_entities(
			product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id
		) VALUES($1,'item',990001,'tooltip-coverage-fixture',$2,$2)
		RETURNING id`, productID, buildID).Scan(&entityID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url)
		VALUES($1,$2,decode(repeat('ab',32),'hex'),'{}'::jsonb,
			'https://wago.tools/db2/ItemSparse/csv?build=5.5.4.990001&locale=enUS')`, entityID, buildID); err != nil {
		t.Fatal(err)
	}
	updateResult, err := database.ExecContext(ctx, `
		UPDATE game_entities entity
		SET latest_version_id=version.id,published_version_id=version.id
		FROM game_entity_versions version
		WHERE version.entity_id=entity.id
		  AND entity.product_id=$1 AND entity.external_id=990001`, productID)
	if err != nil {
		t.Fatal(err)
	}
	if updated, err := updateResult.RowsAffected(); err != nil || updated != 1 {
		t.Fatalf("published fixture update affected %d rows, error=%v", updated, err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO game_entity_localizations(version_id,locale,name)
		SELECT version.id,'en_US','Tooltip coverage fixture'
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id
		WHERE entity.product_id=$1 AND entity.external_id=990001
		UNION ALL
		SELECT version.id,'ru_RU','Проверка tooltip'
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id
		WHERE entity.product_id=$1 AND entity.external_id=990001`, productID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,content_hash,source_url)
		SELECT version.id,'en_US','Tooltip coverage fixture',decode(repeat('cd',32),'hex'),'https://example.invalid/fixture'
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id
		WHERE entity.product_id=$1 AND entity.external_id=990001`, productID); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 107); err != nil {
		t.Fatalf("apply tooltip coverage migration: %v", err)
	}
	assertLibraryTooltipCount(t, ctx, database, productID, "en_US", 1, 1)
	assertLibraryTooltipCount(t, ctx, database, productID, "ru_RU", 1, 0)

	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,content_hash,source_url)
		SELECT version.id,'ru_RU','Проверка tooltip',decode(repeat('ef',32),'hex'),'https://example.invalid/fixture'
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id
		WHERE entity.product_id=$1 AND entity.external_id=990001`, productID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		SELECT refresh_catalog_library_datasets($1)`, productID); err != nil {
		t.Fatal(err)
	}
	assertLibraryTooltipCount(t, ctx, database, productID, "en_US", 1, 1)
	assertLibraryTooltipCount(t, ctx, database, productID, "ru_RU", 1, 1)

	if err := goose.DownToContext(ctx, database, migrations, 106); err != nil {
		t.Fatalf("roll back tooltip coverage migration: %v", err)
	}
	assertLibraryTooltipCount(t, ctx, database, productID, "en_US", 1, 1)
	assertLibraryTooltipCount(t, ctx, database, productID, "ru_RU", 1, 1)
}

func assertLibraryTooltipCount(t *testing.T, ctx context.Context, database *sql.DB, productID int16, locale string, wantEntities, wantTooltips int64) {
	t.Helper()
	var entityCount, tooltipCount int64
	if err := database.QueryRowContext(ctx, `
		SELECT entity_count,tooltip_count
		FROM catalog_library_dataset_stats
		WHERE dataset_slug='items' AND product_id=$1 AND locale=$2`, productID, locale).
		Scan(&entityCount, &tooltipCount); err != nil {
		t.Fatalf("read items coverage for %s: %v", locale, err)
	}
	if entityCount != wantEntities || tooltipCount != wantTooltips {
		t.Fatalf("items coverage for %s = entities:%d tooltips:%d, want entities:%d tooltips:%d",
			locale, entityCount, tooltipCount, wantEntities, wantTooltips)
	}
}
