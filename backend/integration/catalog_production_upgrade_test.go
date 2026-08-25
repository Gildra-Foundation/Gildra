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

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogrelease"
	"github.com/google/uuid"
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
	assertMigrationVersion(t, ctx, database, 69)
	for _, table := range []string{
		"catalog_completeness_expectations",
		"catalog_entity_media",
		"catalog_backup_manifests",
		"catalog_profession_recipes",
		"catalog_npc_roles",
		"catalog_quest_rewards",
		"catalog_releases",
		"catalog_public_release_state",
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
	assertAtomicCatalogRelease(t, ctx, database, postgresURL)
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
			'postgres','logical','verified','file:///local-only.dump',decode(repeat('aa',32),'hex'),1,69,
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
			'postgres','logical','verified','r2://gildra-backups/catalog.dump',decode(repeat('bb',32),'hex'),1,69,
			now(),now(),now(),'{"restore_verified":true,"source_restore_match":true}')`); err != nil {
		t.Fatal(err)
	}
	result, err = runner.Run(ctx, options)
	if err == nil || !strings.Contains(err.Error(), "import-wago") {
		t.Fatalf("production import with valid recovery proof error = %v, want importer lookup failure after the gate", err)
	}
	assertPipelineStage(t, ctx, database, result.RunID, "recovery-gate", "succeeded", "")
}

func assertAtomicCatalogRelease(t *testing.T, ctx context.Context, database *sql.DB, postgresURL string) {
	t.Helper()
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	store := catalogimport.NewStore(pool)
	service := catalog.NewService(pool)
	releases := catalogrelease.NewManager(pool)

	legacy, err := store.Begin(ctx, "wow", 100001, "1.0.0.100001", "us", "wago_tools", nil, map[string]any{"test": "published"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, legacy, catalogTestItem("Published item", "1.0.0.100001")); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, legacy.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	entityID := catalogEntityID(t, ctx, database, 900001)
	assertCatalogName(t, ctx, service, entityID, "Published item")

	failedRunID := insertPipelineRun(t, ctx, database, "1.0.0.100002")
	failedReleaseID, err := releases.Start(ctx, failedRunID, "wow", "1.0.0.100002", []string{"wago"})
	if err != nil {
		t.Fatal(err)
	}
	staging, err := store.Begin(ctx, "wow", 100002, "1.0.0.100002", "us", "wago_tools", &failedReleaseID, map[string]any{"test": "failed"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, staging, catalogTestItem("Unpublished item", "1.0.0.100002")); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, staging.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, true)
	versions, err := service.Versions(ctx, entityID, "en_US", 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) != 1 || versions[0].Name != "Published item" {
		t.Fatalf("public version history leaked staging data: %#v", versions)
	}
	if err := releases.Fail(ctx, failedReleaseID, errors.New("synthetic importer failure")); err != nil {
		t.Fatal(err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)

	publishedRunID := insertPipelineRun(t, ctx, database, "1.0.0.100003")
	publishedReleaseID, err := releases.Start(ctx, publishedRunID, "wow", "1.0.0.100003", []string{"wago"})
	if err != nil {
		t.Fatal(err)
	}
	publication, err := catalog.NewPublicationService(pool, 0).ReleaseStatus(
		ctx, "development", "public_api", publishedReleaseID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if publication.Ready || len(publication.Sources) != 1 || publication.Sources[0].Source != "wago_tools" {
		t.Fatalf("candidate publication sources = %#v, want blocked wago_tools", publication)
	}
	candidate, err := store.Begin(ctx, "wow", 100003, "1.0.0.100003", "us", "wago_tools", &publishedReleaseID, map[string]any{"test": "publish"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, candidate, catalogTestItem("Released item", "1.0.0.100003")); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, candidate.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	assertCatalogName(t, ctx, service, entityID, "Published item")
	if err := releases.Publish(ctx, publishedReleaseID); err != nil {
		t.Fatal(err)
	}
	assertCatalogName(t, ctx, service, entityID, "Released item")
	assertCatalogPointersDiffer(t, ctx, database, entityID, false)

	var releaseStatus, snapshotStatus string
	var publicReleaseID uuid.UUID
	if err := database.QueryRowContext(ctx, `SELECT status FROM catalog_releases WHERE id=$1`, publishedReleaseID).Scan(&releaseStatus); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `SELECT status FROM catalog_snapshots WHERE id=$1`, candidate.SnapshotID).Scan(&snapshotStatus); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT state.release_id
		FROM catalog_public_release_state state
		JOIN game_products product ON product.id=state.product_id
		WHERE product.slug='wow'`).Scan(&publicReleaseID); err != nil {
		t.Fatal(err)
	}
	if releaseStatus != "published" || snapshotStatus != "published" || publicReleaseID != publishedReleaseID {
		t.Fatalf("release state = (%s,%s,%s), want published release %s", releaseStatus, snapshotStatus, publicReleaseID, publishedReleaseID)
	}
	sameBuildRunID := insertPipelineRun(t, ctx, database, "1.0.0.100003")
	if _, err := releases.Start(ctx, sameBuildRunID, "wow", "1.0.0.100003", []string{"wago"}); !errors.Is(err, catalogrelease.ErrBuildAlreadyPublished) {
		t.Fatalf("same-build release error = %v, want ErrBuildAlreadyPublished", err)
	}
	unchanged, err := (&catalogpipeline.Runner{DB: pool, Stdout: io.Discard, Stderr: io.Discard}).Run(ctx, catalogpipeline.Options{
		PipelineKey: "same-build-test", Trigger: "manual", Mode: "apply", Profile: "custom",
		Product: "wow", Sources: []string{"wago"}, BuildVersion: "1.0.0.100003",
		MaxRecords: 10, BinaryDirectory: t.TempDir(), PublicationEnvironment: "development",
	})
	if err != nil || unchanged.Status != "succeeded" || unchanged.ReleaseID != "" {
		t.Fatalf("same-build pipeline = (%#v,%v), want successful no-op", unchanged, err)
	}
	assertPipelineStage(t, ctx, database, unchanged.RunID, "release-start", "skipped", "")
}

func catalogTestItem(name, build string) catalogimport.Record {
	payload := `{"name":{"en_US":"` + name + `"},"description":{"en_US":"Atomic release test"},"level":100}`
	return catalogimport.Record{
		Type: "item", ExternalID: 900001, Locale: "en_US", Payload: []byte(payload),
		SourceURL: "https://wago.tools/db2/ItemSparse/csv?build=" + build,
	}
}

func insertPipelineRun(t *testing.T, ctx context.Context, database *sql.DB, buildVersion string) int64 {
	t.Helper()
	var runID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_pipeline_runs(
			pipeline_key,trigger_kind,mode,status,product,requested_sources,build_version,
			publication_environment,started_at,current_stage
		) VALUES('atomic-release-test','manual','apply','running','wow',ARRAY['wago'],$1,'development',now(),'release-start')
		RETURNING id`, buildVersion).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	return runID
}

func catalogEntityID(t *testing.T, ctx context.Context, database *sql.DB, externalID int64) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_entities WHERE entity_type='item' AND external_id=$1`, externalID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func assertCatalogName(t *testing.T, ctx context.Context, service *catalog.Service, entityID uuid.UUID, want string) {
	t.Helper()
	entity, err := service.Get(ctx, entityID, "en_US")
	if err != nil {
		t.Fatal(err)
	}
	if entity.Name != want {
		t.Fatalf("public entity name = %q, want %q", entity.Name, want)
	}
}

func assertCatalogPointersDiffer(t *testing.T, ctx context.Context, database *sql.DB, entityID uuid.UUID, want bool) {
	t.Helper()
	var differ bool
	if err := database.QueryRowContext(ctx, `
		SELECT latest_version_id IS DISTINCT FROM published_version_id
		FROM game_entities WHERE id=$1`, entityID).Scan(&differ); err != nil {
		t.Fatal(err)
	}
	if differ != want {
		t.Fatalf("catalog pointers differ = %t, want %t", differ, want)
	}
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
