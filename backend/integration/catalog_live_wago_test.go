//go:build integration && live

package integration

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// TestBoundedLiveWagoCatalogImport is deliberately excluded from normal CI.
// It proves that the current external CSV contract still produces real,
// localized, published catalog rows without touching any persistent database.
func TestBoundedLiveWagoCatalogImport(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
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
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, postgresURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	client := wago.New(wago.Config{})
	buildVersion, err := client.CurrentBuild(ctx, "ItemSparse", "enUS")
	if err != nil {
		t.Fatal(err)
	}
	buildParts := strings.Split(buildVersion, ".")
	if len(buildParts) != 4 {
		t.Fatalf("live build = %q", buildVersion)
	}
	buildNumber, err := strconv.Atoi(buildParts[3])
	if err != nil || buildNumber <= 0 {
		t.Fatalf("live build number = %q", buildParts[3])
	}
	store := catalogimport.NewStore(pool)
	importContext, err := store.Begin(ctx, "wow", buildNumber, buildVersion, "us", "wago_tools", nil,
		map[string]any{"live_contract_probe": true, "max_records": 5})
	if err != nil {
		t.Fatal(err)
	}

	var seen, written int64
	for localeIndex, locale := range []struct{ storage, source string }{{"en_US", "enUS"}, {"ru_RU", "ruRU"}} {
		sourceURL := client.CSVURL("ItemSparse", buildVersion, locale.source)
		artifactID, err := store.RegisterArtifact(ctx, importContext, "wago_tools", "ItemSparse", locale.storage, sourceURL,
			map[string]any{"live_contract_probe": true, "bounded": true, "max_records": 5})
		if err != nil {
			t.Fatal(err)
		}
		_, _, err = client.RowsWithProof(ctx, "ItemSparse", buildVersion, locale.source, 5, func(row map[string]string) error {
			seen++
			externalID, parseErr := strconv.ParseInt(row["ID"], 10, 64)
			if parseErr != nil || externalID <= 0 || strings.TrimSpace(row["Display_lang"]) == "" {
				t.Fatalf("invalid live ItemSparse row: %#v", row)
			}
			payload, marshalErr := json.Marshal(map[string]any{
				"id": externalID, "name": row["Display_lang"], "db2": row,
			})
			if marshalErr != nil {
				return marshalErr
			}
			record := catalogimport.Record{
				Type: "item", ExternalID: externalID, Locale: locale.storage,
				Payload: payload, SourceURL: sourceURL, SourceArtifactID: &artifactID,
			}
			if localeIndex == 0 {
				if err := store.UpsertCanonical(ctx, importContext, record); err != nil {
					return err
				}
			} else if err := store.UpsertLocalization(ctx, importContext, record); err != nil {
				return err
			}
			written++
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Finish(ctx, importContext.RunID, "SUCCEEDED", seen, written, nil); err != nil {
		t.Fatal(err)
	}

	var entities, published, english, russian, provenanced int64
	var snapshotStatus, source string
	if err := database.QueryRowContext(ctx, `
		SELECT count(*),count(published_version_id)
		FROM game_entities WHERE entity_type='item' AND deleted_at IS NULL`).Scan(&entities, &published); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT count(*) FILTER (WHERE locale='en_US'),count(*) FILTER (WHERE locale='ru_RU')
		FROM game_entity_localizations`).Scan(&english, &russian); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT count(*)
		FROM game_entity_versions
		WHERE source='wago_tools' AND source_url LIKE 'https://wago.tools/%'
		  AND source_url LIKE '%' || $1 || '%' AND source_artifact_id IS NOT NULL`, buildVersion).Scan(&provenanced); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		SELECT snapshot.status,version.source
		FROM catalog_snapshots snapshot
		JOIN game_entity_versions version ON version.snapshot_id=snapshot.id
		WHERE snapshot.id=$1 LIMIT 1`, importContext.SnapshotID).Scan(&snapshotStatus, &source); err != nil {
		t.Fatal(err)
	}
	if entities != 5 || published != 5 || english != 5 || russian != 5 || provenanced != 5 || snapshotStatus != "published" || source != "wago_tools" {
		t.Fatalf("live import counts=(%d,%d,%d,%d,%d) state=(%s,%s)", entities, published, english, russian, provenanced, snapshotStatus, source)
	}
	t.Logf("verified Wago build %s with %d real bilingual item rows", buildVersion, entities)
}
