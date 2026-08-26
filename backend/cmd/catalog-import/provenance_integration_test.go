//go:build integration

package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/attimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/attparser"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestWagoImportPreservesArtifactProvenance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		locale := request.URL.Query().Get("locale")
		table := strings.TrimSuffix(strings.TrimPrefix(request.URL.Path, "/db2/"), "/csv")
		response.Header().Set("Content-Type", "text/csv")
		switch table {
		case "ItemSparse":
			name := map[string]string{"enUS": "Proof Item", "ruRU": "Проверочный предмет"}[locale]
			_, _ = fmt.Fprintf(response, "ID,Display_lang,Description_lang,ItemLevel,RequiredLevel,MaxCount,BuyPrice,SellPrice,InventoryType,OverallQualityID,Stackable\n25,%s,Source-backed,10,1,0,0,0,0,1,20\n", name)
		case "SpellName":
			name := map[string]string{"enUS": "Proof Spell", "ruRU": "Проверочное заклинание"}[locale]
			_, _ = fmt.Fprintf(response, "ID,Name_lang\n133,%s\n", name)
		case "Spell":
			_, _ = fmt.Fprint(response, "ID,Description_lang,NameSubtext_lang,AuraDescription_lang\n133,Spell description,,\n")
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	migrations, err := filepath.Abs("../../migrations/postgres")
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
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	store := catalogimport.NewStore(pool)
	ic, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "wago_tools", nil,
		map[string]any{"integration_test": "wago_artifact_provenance"})
	if err != nil {
		t.Fatal(err)
	}
	client := wago.New(wago.Config{BaseURL: server.URL, HTTPClient: server.Client(), RetryMax: 1})
	opts := options{
		buildVersion: "12.1.0.69497", locales: []string{"en_US", "ru_RU"},
		entityTypes: []string{"item", "spell"}, maxRecords: 1,
	}
	var seen, written int64
	if err := importWago(ctx, client, store, ic, opts, &seen, &written); err != nil {
		t.Fatal(err)
	}
	if seen != 4 || written != 4 {
		t.Fatalf("Wago counters = (%d,%d), want (4,4)", seen, written)
	}

	var versions, unproven, artifacts, localizations int64
	if err := pool.QueryRow(ctx, `
		SELECT count(*),count(*) FILTER (WHERE source_artifact_id IS NULL)
		FROM game_entity_versions WHERE snapshot_id=$1`, ic.SnapshotID).Scan(&versions, &unproven); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM catalog_source_artifacts
		WHERE snapshot_id=$1 AND source='wago_tools' AND status='ready'`, ic.SnapshotID).Scan(&artifacts); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM game_entity_localizations localized
		JOIN game_entity_versions version ON version.id=localized.version_id
		WHERE version.snapshot_id=$1`, ic.SnapshotID).Scan(&localizations); err != nil {
		t.Fatal(err)
	}
	if versions != 2 || unproven != 0 || artifacts != 4 || localizations != 4 {
		t.Fatalf("Wago provenance counts = versions:%d unproven:%d artifacts:%d localizations:%d",
			versions, unproven, artifacts, localizations)
	}

	manifestArtifactID, err := store.RegisterPendingArtifact(ctx, ic, "blizzard_api",
		"battlenet/test", "en_US", server.URL+"/battle-net-test", map[string]any{
			"proof_scope": "source_record_manifest_v1",
		})
	if err != nil {
		t.Fatal(err)
	}
	for key, payload := range map[string]string{"1": `{"id":1}`, "2": `{"id":2}`} {
		if _, err := store.UpsertSourceRecord(ctx, manifestArtifactID, key, []byte(payload)); err != nil {
			t.Fatal(err)
		}
	}
	proof, err := store.CompleteArtifactFromRecords(ctx, manifestArtifactID)
	if err != nil {
		t.Fatal(err)
	}
	if proof.RecordCount != 2 || proof.ByteSize <= 0 {
		t.Fatalf("Battle.net manifest proof = %#v", proof)
	}
	var manifestStatus string
	var manifestHashBytes, manifestByteSize, manifestRecords int64
	if err := pool.QueryRow(ctx, `
		SELECT artifact.status,octet_length(artifact.content_hash),artifact.byte_size,count(record.record_key)
		FROM catalog_source_artifacts artifact
		LEFT JOIN catalog_source_records record ON record.artifact_id=artifact.id
		WHERE artifact.id=$1
		GROUP BY artifact.id`, manifestArtifactID).Scan(
		&manifestStatus, &manifestHashBytes, &manifestByteSize, &manifestRecords,
	); err != nil {
		t.Fatal(err)
	}
	if manifestStatus != "ready" || manifestHashBytes != 32 || manifestByteSize != proof.ByteSize || manifestRecords != 2 {
		t.Fatalf("persisted Battle.net proof = status:%s hash:%d bytes:%d records:%d",
			manifestStatus, manifestHashBytes, manifestByteSize, manifestRecords)
	}

	attContext, err := store.Begin(ctx, "wow", 69497, "12.1.0.69497", "us", "all_the_things", nil,
		map[string]any{"integration_test": "att_staged_graph"})
	if err != nil {
		t.Fatal(err)
	}
	attSource := []byte("local i,n=_.CreateItem,_.CreateNPC\nn(42,{g={i(100,{providers={{\"n\",42}}})}})\n")
	attNodes, err := attparser.Parse(attSource, "db/Standard/Categories/Test.lua")
	if err != nil {
		t.Fatal(err)
	}
	attArtifactID, err := store.RegisterPendingArtifact(ctx, attContext, "all_the_things",
		"att/db/Standard/Categories/Test.lua", "", "https://example.test/Test.lua", map[string]any{
			"revision": "integration-test", "parser": "att_static_ast_v1",
		})
	if err != nil {
		t.Fatal(err)
	}
	attResult, err := attimport.NewStore(pool).ReplaceFile(ctx, attContext, attArtifactID, "all_the_things", attNodes)
	if err != nil {
		t.Fatal(err)
	}
	attHash := sha256.Sum256(attSource)
	if err := store.CompleteArtifact(ctx, attArtifactID, attHash[:], int64(len(attSource)), ""); err != nil {
		t.Fatal(err)
	}
	var stagedNodes, stagedReferences int64
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_staged_source_nodes WHERE source_artifact_id=$1`, attArtifactID).Scan(&stagedNodes); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM catalog_staged_source_references reference
		JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
		WHERE node.source_artifact_id=$1`, attArtifactID).Scan(&stagedReferences); err != nil {
		t.Fatal(err)
	}
	if attResult.Nodes != 2 || attResult.References != 1 || stagedNodes != 2 || stagedReferences != 1 {
		t.Fatalf("ATT staged graph = result:%#v nodes:%d references:%d", attResult, stagedNodes, stagedReferences)
	}
	if err := store.FinishStaged(ctx, attContext.RunID, "SUCCEEDED", attResult.Nodes,
		attResult.Nodes+attResult.References, nil); err != nil {
		t.Fatal(err)
	}
	var attSnapshotStatus string
	var attBuildActive bool
	if err := pool.QueryRow(ctx, `
		SELECT snapshot.status,build.is_active
		FROM catalog_snapshots snapshot
		JOIN game_builds build ON build.id=snapshot.build_id
		WHERE snapshot.id=$1`, attContext.SnapshotID).Scan(&attSnapshotStatus, &attBuildActive); err != nil {
		t.Fatal(err)
	}
	if attSnapshotStatus != "validated" || attBuildActive {
		t.Fatalf("ATT snapshot = status:%s build_active:%t", attSnapshotStatus, attBuildActive)
	}
}
