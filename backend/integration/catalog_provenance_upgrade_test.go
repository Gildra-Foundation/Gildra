//go:build integration

package integration

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestFullArtifactReplacesUnprovenBoundedVersionProvenance(t *testing.T) {
	ctx := t.Context()
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
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	store := catalogimport.NewStore(pool)
	record := catalogimport.Record{
		Type:       "item",
		ExternalID: 25,
		Locale:     "en_US",
		Payload:    json.RawMessage(`{"id":25,"name":"Proof Item"}`),
		SourceURL:  "https://wago.tools/db2/ItemSparse/csv?build=12.1.0.69497&locale=enUS",
	}

	bounded, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "wago_tools", nil,
		map[string]any{"bounded": true})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpdateProgress(ctx, bounded.RunID, 1, 0); err != nil {
		t.Fatal(err)
	}
	if err := store.UpdateProgress(ctx, bounded.RunID, 0, 0); err != nil {
		t.Fatal(err)
	}
	var progressSeen, progressWritten int64
	if err := pool.QueryRow(ctx, `
		SELECT records_seen,records_written FROM catalog_import_runs WHERE id=$1`, bounded.RunID).
		Scan(&progressSeen, &progressWritten); err != nil {
		t.Fatal(err)
	}
	if progressSeen != 1 || progressWritten != 0 {
		t.Fatalf("monotonic progress = %d/%d, want 1/0", progressSeen, progressWritten)
	}
	boundedArtifact, err := store.RegisterArtifact(ctx, bounded, "wago_tools", "ItemSparse", "en_US",
		record.SourceURL, map[string]any{"bounded": true})
	if err != nil {
		t.Fatal(err)
	}
	record.SourceArtifactID = &boundedArtifact
	if err := store.UpsertCanonical(ctx, bounded, record); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, bounded.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}

	full, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "wago_tools", nil,
		map[string]any{"bounded": false})
	if err != nil {
		t.Fatal(err)
	}
	fullArtifact, err := store.RegisterPendingArtifact(ctx, full, "wago_tools", "ItemSparse", "en_US",
		record.SourceURL, map[string]any{"bounded": false})
	if err != nil {
		t.Fatal(err)
	}
	fullSupportingArtifact, err := store.RegisterPendingArtifact(ctx, full, "wago_tools", "ItemEffect", "en_US",
		"https://wago.tools/db2/ItemEffect/csv?build=12.1.0.69497&locale=enUS",
		map[string]any{"bounded": false, "projection": "supporting"})
	if err != nil {
		t.Fatal(err)
	}
	record.SourceArtifactID = &fullArtifact
	record.SupportingSourceArtifactIDs = []uuid.UUID{fullSupportingArtifact, fullArtifact}
	if err := store.UpsertCanonical(ctx, full, record); err != nil {
		t.Fatal(err)
	}
	proof := sha256.Sum256([]byte("complete Wago ItemSparse fixture"))
	if err := store.CompleteArtifact(ctx, fullArtifact, proof[:], 32, `"fixture-etag"`); err != nil {
		t.Fatal(err)
	}
	if err := store.CompleteArtifact(ctx, fullSupportingArtifact, proof[:], 32, `"supporting-etag"`); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, full.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}

	var versions, latestProved, localizationProved int64
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM game_entity_versions version
		JOIN game_entities entity ON entity.id=version.entity_id
		WHERE entity.entity_type='item' AND entity.external_id=25`).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN catalog_entity_version_artifacts observation ON observation.version_id=version.id
		JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
		WHERE entity.entity_type='item' AND entity.external_id=25
		  AND artifact.id=ANY($1)
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL`,
		[]uuid.UUID{fullArtifact, fullSupportingArtifact}).Scan(&latestProved); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN catalog_entity_localization_artifacts observation
		  ON observation.version_id=version.id AND observation.locale='en_US'
		JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
		WHERE entity.entity_type='item' AND entity.external_id=25
		  AND artifact.id=ANY($1)
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL`,
		[]uuid.UUID{fullArtifact, fullSupportingArtifact}).Scan(&localizationProved); err != nil {
		t.Fatal(err)
	}
	if versions != 1 || latestProved != 2 || localizationProved != 2 {
		t.Fatalf("bounded-to-full provenance = versions:%d latest_proved:%d localization_proved:%d, want 1/2/2",
			versions, latestProved, localizationProved)
	}

	// A later complete import of identical bytes reuses the already proven
	// version instead of creating a third revision.
	repeated, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "wago_tools", nil,
		map[string]any{"bounded": false, "repeat": true})
	if err != nil {
		t.Fatal(err)
	}
	repeatedArtifact, err := store.RegisterPendingArtifact(ctx, repeated, "wago_tools", "ItemSparse", "en_US",
		record.SourceURL, map[string]any{"bounded": false, "repeat": true})
	if err != nil {
		t.Fatal(err)
	}
	record.SourceArtifactID = &repeatedArtifact
	record.SupportingSourceArtifactIDs = nil
	if err := store.UpsertCanonical(ctx, repeated, record); err != nil {
		t.Fatal(err)
	}
	if err := store.CompleteArtifact(ctx, repeatedArtifact, proof[:], 32, `"fixture-etag"`); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, repeated.RunID, "SUCCEEDED", 1, 1, nil); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM game_entity_versions version
		JOIN game_entities entity ON entity.id=version.entity_id
		WHERE entity.entity_type='item' AND entity.external_id=25`).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if versions != 1 {
		t.Fatalf("proven repeated import created %d versions, want 1", versions)
	}
}
