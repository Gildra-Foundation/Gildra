//go:build integration

package integration

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	ch "github.com/ClickHouse/clickhouse-go/v2"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	chcontainer "github.com/testcontainers/testcontainers-go/modules/clickhouse"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestPostgresAndClickHouseMigrations(t *testing.T) {
	ctx := context.Background()
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}

	postgres, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"), pgcontainer.WithUsername("gildra"), pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, postgres)
	postgresURL, err := postgres.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	postgresDB, err := sql.Open("pgx", postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer postgresDB.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, postgresDB, filepath.Join(migrations, "postgres")); err != nil {
		t.Fatal(err)
	}
	var usersTable string
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.users')::text`).Scan(&usersTable); err != nil || usersTable != "users" {
		t.Fatalf("users migration failed: table=%q error=%v", usersTable, err)
	}
	var catalogTable string
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.game_entities')::text`).Scan(&catalogTable); err != nil || catalogTable != "game_entities" {
		t.Fatalf("catalog migration failed: table=%q error=%v", catalogTable, err)
	}
	var products int
	if err := postgresDB.QueryRowContext(ctx, `SELECT count(*) FROM game_products`).Scan(&products); err != nil || products != 4 {
		t.Fatalf("game product seed failed: count=%d error=%v", products, err)
	}
	var datasetName string
	if err := postgresDB.QueryRowContext(ctx, `SELECT name FROM datasets WHERE slug = 'tierlist-wowhead'`).Scan(&datasetName); err != nil || datasetName != "Tierlist WoWHead" {
		t.Fatalf("tier-list dataset seed failed: name=%q error=%v", datasetName, err)
	}
	var archonDatasetName, archonTable string
	if err := postgresDB.QueryRowContext(ctx, `SELECT name FROM datasets WHERE slug = 'tierlist-archon'`).Scan(&archonDatasetName); err != nil || archonDatasetName != "Tierlist Archon" {
		t.Fatalf("Archon dataset seed failed: name=%q error=%v", archonDatasetName, err)
	}
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.archon_tierlist_entries')::text`).Scan(&archonTable); err != nil || archonTable != "archon_tierlist_entries" {
		t.Fatalf("Archon tier-list migration failed: table=%q error=%v", archonTable, err)
	}
	var wowGGDatasetName, wowGGContextsTable, wowGGEntriesTable string
	if err := postgresDB.QueryRowContext(ctx, `SELECT name FROM datasets WHERE slug = 'tierlist-wowgg'`).Scan(&wowGGDatasetName); err != nil || wowGGDatasetName != "Tierlist — wow.gg" {
		t.Fatalf("wow.gg dataset seed failed: name=%q error=%v", wowGGDatasetName, err)
	}
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.wowgg_tierlist_contexts')::text`).Scan(&wowGGContextsTable); err != nil || wowGGContextsTable != "wowgg_tierlist_contexts" {
		t.Fatalf("wow.gg context migration failed: table=%q error=%v", wowGGContextsTable, err)
	}
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.wowgg_tierlist_entries')::text`).Scan(&wowGGEntriesTable); err != nil || wowGGEntriesTable != "wowgg_tierlist_entries" {
		t.Fatalf("wow.gg entry migration failed: table=%q error=%v", wowGGEntriesTable, err)
	}
	var icyVeinsDatasetName, icyVeinsPagesTable, icyVeinsEntriesTable string
	if err := postgresDB.QueryRowContext(ctx, `SELECT name FROM datasets WHERE slug = 'tierlist-icyveins'`).Scan(&icyVeinsDatasetName); err != nil || icyVeinsDatasetName != "Tierlist — Icy Veins" {
		t.Fatalf("Icy Veins dataset seed failed: name=%q error=%v", icyVeinsDatasetName, err)
	}
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.icyveins_tierlist_pages')::text`).Scan(&icyVeinsPagesTable); err != nil || icyVeinsPagesTable != "icyveins_tierlist_pages" {
		t.Fatalf("Icy Veins page migration failed: table=%q error=%v", icyVeinsPagesTable, err)
	}
	if err := postgresDB.QueryRowContext(ctx, `SELECT to_regclass('public.icyveins_tierlist_entries')::text`).Scan(&icyVeinsEntriesTable); err != nil || icyVeinsEntriesTable != "icyveins_tierlist_entries" {
		t.Fatalf("Icy Veins entry migration failed: table=%q error=%v", icyVeinsEntriesTable, err)
	}
	assertLastKnownGoodSurvivesFailedRun(t, ctx, postgresDB, "tierlist-wowhead", 6, 80, 40)
	assertLastKnownGoodSurvivesFailedRun(t, ctx, postgresDB, "tierlist-archon", 12, 139, 40)
	assertLastKnownGoodSurvivesFailedRun(t, ctx, postgresDB, "tierlist-wowgg", 394, 3198, 41)
	assertLastKnownGoodSurvivesFailedRun(t, ctx, postgresDB, "tierlist-icyveins", 8, 114, 40)

	clickhouse, err := chcontainer.Run(ctx, "clickhouse/clickhouse-server:26.7.3-alpine",
		chcontainer.WithDatabase("gildra"), chcontainer.WithUsername("gildra"), chcontainer.WithPassword("test-password"))
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, clickhouse)
	dsn, err := clickhouse.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	options, err := ch.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	clickhouseDB := ch.OpenDB(options)
	defer clickhouseDB.Close()
	if err := goose.SetDialect("clickhouse"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, clickhouseDB, filepath.Join(migrations, "clickhouse")); err != nil {
		t.Fatal(err)
	}
	var eventsTable string
	if err := clickhouseDB.QueryRowContext(ctx, `SELECT name FROM system.tables WHERE database = 'gildra' AND name = 'analytics_events'`).Scan(&eventsTable); err != nil || eventsTable != "analytics_events" {
		t.Fatalf("ClickHouse migration failed: table=%q error=%v", eventsTable, err)
	}
	var crawlerTable string
	if err := clickhouseDB.QueryRowContext(ctx, `SELECT name FROM system.tables WHERE database = 'gildra' AND name = 'crawler_attempts'`).Scan(&crawlerTable); err != nil || crawlerTable != "crawler_attempts" {
		t.Fatalf("crawler analytics migration failed: table=%q error=%v", crawlerTable, err)
	}
	var datasetRefreshTable string
	if err := clickhouseDB.QueryRowContext(ctx, `SELECT name FROM system.tables WHERE database = 'gildra' AND name = 'dataset_refresh_events'`).Scan(&datasetRefreshTable); err != nil || datasetRefreshTable != "dataset_refresh_events" {
		t.Fatalf("dataset refresh analytics migration failed: table=%q error=%v", datasetRefreshTable, err)
	}
}

func assertLastKnownGoodSurvivesFailedRun(t *testing.T, ctx context.Context, database *sql.DB, slug string, pageCount, recordCount, uniqueSpecCount int) {
	t.Helper()
	transaction, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer transaction.Rollback()

	var datasetID, runID, snapshotID string
	if err := transaction.QueryRowContext(ctx, `SELECT id::text FROM datasets WHERE slug = $1`, slug).Scan(&datasetID); err != nil {
		t.Fatal(err)
	}
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO dataset_runs (dataset_id, run_key, trigger, scheduled_for, status)
		VALUES ($1, $2, 'seed', CURRENT_DATE, 'running')
		RETURNING id::text`, datasetID, "seed:test-lkg:"+slug).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	contentHash := make([]byte, 32)
	if err := transaction.QueryRowContext(ctx, `
		INSERT INTO dataset_snapshots (
			dataset_id, run_id, source_fetched_at, content_hash,
			page_count, record_count, unique_spec_count, payload
		) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}')
		RETURNING id::text`, datasetID, runID, time.Now().UTC(), contentHash, pageCount, recordCount, uniqueSpecCount).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx,
		`UPDATE dataset_runs SET status = 'succeeded', snapshot_id = $1 WHERE id = $2`,
		snapshotID, runID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx,
		`UPDATE datasets SET current_snapshot_id = $1 WHERE id = $2`,
		snapshotID, datasetID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx, `
		INSERT INTO dataset_runs (
			dataset_id, run_key, trigger, scheduled_for, status,
			lkg_snapshot_id, error_code, error_summary
		) VALUES ($1, $2, 'scheduled', CURRENT_DATE, 'failed', $3,
			'validation_failed', 'candidate was incomplete')`, datasetID, "daily:failed-test:"+slug, snapshotID); err != nil {
		t.Fatal(err)
	}
	if _, err := transaction.ExecContext(ctx,
		`UPDATE datasets SET last_error_code = 'validation_failed' WHERE id = $1`,
		datasetID,
	); err != nil {
		t.Fatal(err)
	}
	var currentSnapshotID string
	if err := transaction.QueryRowContext(ctx, `SELECT current_snapshot_id::text FROM datasets WHERE id = $1`, datasetID).Scan(&currentSnapshotID); err != nil {
		t.Fatal(err)
	}
	if currentSnapshotID != snapshotID {
		t.Fatalf("failed refresh replaced last-known-good snapshot: got=%s want=%s", currentSnapshotID, snapshotID)
	}
	if err := transaction.Commit(); err != nil {
		t.Fatal(err)
	}
}
