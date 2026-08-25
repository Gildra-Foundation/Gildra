//go:build integration

package integration

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestPostgresProductionBaselineUpgrade(t *testing.T) {
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
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 15); err != nil {
		t.Fatalf("apply immutable production baseline: %v", err)
	}

	const proofEmail = "migration-proof@example.invalid"
	var proofUserID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO users(email,display_name) VALUES($1,'Migration proof')
		RETURNING id::text`, proofEmail).Scan(&proofUserID); err != nil {
		t.Fatal(err)
	}
	assertMigrationVersion(t, ctx, database, 15)
	assertTablePresent(t, ctx, database, "mythicstats_pages")

	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatalf("upgrade production baseline to Warcraft catalog: %v", err)
	}
	assertMigrationVersion(t, ctx, database, 66)
	for _, table := range []string{
		"catalog_completeness_expectations",
		"catalog_entity_media",
		"catalog_backup_manifests",
		"catalog_profession_recipes",
		"catalog_npc_roles",
		"catalog_quest_rewards",
	} {
		assertTablePresent(t, ctx, database, table)
	}
	var restoredUserID string
	if err := database.QueryRowContext(ctx, `SELECT id::text FROM users WHERE email=$1`, proofEmail).Scan(&restoredUserID); err != nil {
		t.Fatalf("read baseline row after upgrade: %v", err)
	}
	if restoredUserID != proofUserID {
		t.Fatalf("baseline row changed during upgrade: got=%s want=%s", restoredUserID, proofUserID)
	}
	assertProductionRecoveryGate(t, ctx, database, postgresURL)
}

func assertProductionRecoveryGate(t *testing.T, ctx context.Context, database *sql.DB, postgresURL string) {
	t.Helper()
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	runner := &catalogpipeline.Runner{DB: pool, Stdout: io.Discard, Stderr: io.Discard}
	options := catalogpipeline.Options{
		PipelineKey: "catalog-refresh-test", Trigger: "manual", Mode: "apply",
		Profile: catalogpipeline.ProfileRetailFoundation, Product: "wow",
		BuildVersion: "12.1.0.69404", MaxRecords: 1,
		BinaryDirectory: t.TempDir(), PublicationEnvironment: "production",
	}
	result, err := runner.Run(ctx, options)
	if !errors.Is(err, catalogpipeline.ErrRecoveryGate) {
		t.Fatalf("production import without backup proof error = %v, want ErrRecoveryGate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "failed", "verified_backup_missing")

	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_backup_manifests(
			component,backup_kind,status,storage_uri,content_hash,byte_size,database_version,
			completed_at,restore_started_at,restore_completed_at,verification)
		VALUES(
			'postgres','logical','verified','file:///local-only.dump',decode(repeat('aa',32),'hex'),1,66,
			now(),now(),now(),'{"restore_verified":true,"source_restore_match":true}')`); err != nil {
		t.Fatal(err)
	}
	result, err = runner.Run(ctx, options)
	if !errors.Is(err, catalogpipeline.ErrRecoveryGate) {
		t.Fatalf("local-only backup error = %v, want ErrRecoveryGate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "failed", "verified_backup_missing")

	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_backup_manifests(
			component,backup_kind,status,storage_uri,content_hash,byte_size,database_version,
			completed_at,restore_started_at,restore_completed_at,verification)
		VALUES(
			'postgres','logical','verified','r2://gildra-backups/catalog.dump',decode(repeat('bb',32),'hex'),1,66,
			now(),now(),now(),'{"restore_verified":true,"source_restore_match":true}')`); err != nil {
		t.Fatal(err)
	}
	result, err = runner.Run(ctx, options)
	if err == nil || !strings.Contains(err.Error(), "import-wago") {
		t.Fatalf("production import with valid recovery proof error = %v, want importer lookup failure after the gate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "succeeded", "")
}

func assertPipelineStage(t *testing.T, ctx context.Context, database *sql.DB, runID int64, stageKey, wantStatus, wantCode string) {
	t.Helper()
	var status, code string
	if err := database.QueryRowContext(ctx, `SELECT status,error_code FROM catalog_pipeline_stages WHERE run_id=$1 AND stage_key=$2`, runID, stageKey).Scan(&status, &code); err != nil {
		t.Fatal(err)
	}
	if status != wantStatus || code != wantCode {
		t.Fatalf("stage %s = (%s,%s), want (%s,%s)", stageKey, status, code, wantStatus, wantCode)
	}
}

func assertMigrationVersion(t *testing.T, ctx context.Context, database *sql.DB, expected int64) {
	t.Helper()
	var actual int64
	if err := database.QueryRowContext(ctx, `SELECT max(version_id) FROM goose_db_version WHERE is_applied`).Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		t.Fatalf("migration version = %d, want %d", actual, expected)
	}
}

func assertTablePresent(t *testing.T, ctx context.Context, database *sql.DB, table string) {
	t.Helper()
	var present bool
	if err := database.QueryRowContext(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&present); err != nil {
		t.Fatal(err)
	}
	if !present {
		t.Fatalf("expected table %q to exist", table)
	}
}
