//go:build integration

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestListfileAssetsRetainSnapshotProvenance(t *testing.T) {
	ctx := context.Background()
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
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	store := catalogimport.NewStore(pool)
	ic, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "wow_listfile", nil, map[string]any{"test": true})
	if err != nil {
		t.Fatal(err)
	}
	const sourceURL = "https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv"
	artifactID, err := store.RegisterArtifact(ctx, ic, "wow_listfile", "community-listfile.csv", "", sourceURL, map[string]any{"test": true})
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte("Interface/Icons/inv_test.blp"))
	written, err := upsert(ctx, pool, ic, artifactID, sourceURL, []asset{{
		id: 987654321, path: "Interface/Icons/inv_test.blp", icon: "inv_test", hash: digest[:],
	}})
	if err != nil {
		t.Fatal(err)
	}
	if written != 1 {
		t.Fatalf("written assets = %d, want 1", written)
	}
	var staged, active int
	if err := database.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM catalog_file_asset_versions WHERE snapshot_id=$1 AND source_artifact_id=$2),
			(SELECT count(*) FROM catalog_file_assets WHERE file_data_id=987654321)`, ic.SnapshotID, artifactID).
		Scan(&staged, &active); err != nil {
		t.Fatal(err)
	}
	if staged != 1 || active != 0 {
		t.Fatalf("asset counts before publication = staged:%d active:%d, want 1:0", staged, active)
	}
	if err := store.Finish(ctx, ic.RunID, "SUCCEEDED", 1, written, nil); err != nil {
		t.Fatal(err)
	}
	if err := publishStandaloneAssets(ctx, pool, ic.SnapshotID); err != nil {
		t.Fatal(err)
	}
	var snapshotID, storedArtifactID string
	if err := database.QueryRowContext(ctx, `
		SELECT snapshot_id::text,source_artifact_id::text
		FROM catalog_file_assets WHERE file_data_id=987654321`).Scan(&snapshotID, &storedArtifactID); err != nil {
		t.Fatal(err)
	}
	if snapshotID != ic.SnapshotID.String() || storedArtifactID != artifactID.String() {
		t.Fatalf("active provenance = (%s,%s), want (%s,%s)", snapshotID, storedArtifactID, ic.SnapshotID, artifactID)
	}
	if err := goose.DownToContext(ctx, database, migrations, 69); err != nil {
		t.Fatalf("roll back migration 70 after a real listfile run: %v", err)
	}
	if err := goose.UpToContext(ctx, database, migrations, 70); err != nil {
		t.Fatalf("reapply migration 70 after rollback: %v", err)
	}
	var retainedRuns int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_import_runs WHERE id=$1 AND source='wow_listfile'`, ic.RunID).Scan(&retainedRuns); err != nil {
		t.Fatal(err)
	}
	if retainedRuns != 1 {
		t.Fatalf("listfile import runs retained after migration rollback = %d, want 1", retainedRuns)
	}
}
