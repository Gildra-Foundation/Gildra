//go:build integration

package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
}
