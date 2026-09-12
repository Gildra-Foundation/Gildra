//go:build integration

package catalogimport

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestRecordBattleNetUnavailableDetail(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

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

	store := NewStore(pool)
	var productID int16
	if err := pool.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	buildVersion := "12.1.0.8446001"
	releaseIDs := []uuid.UUID{uuid.New(), uuid.New()}
	for _, releaseID := range releaseIDs {
		if _, err := pool.Exec(ctx, `
			INSERT INTO catalog_releases (id,product_id,build_version,status)
			VALUES ($1,$2,$3,'staging')`, releaseID, productID, buildVersion); err != nil {
			t.Fatal(err)
		}
	}

	contexts := make([]ImportContext, 0, len(releaseIDs))
	for _, releaseID := range releaseIDs {
		releaseID := releaseID
		ic, err := store.Begin(ctx, "wow", 8446001, buildVersion, "us", "battlenet", &releaseID,
			map[string]any{"integration_test": "unavailable_detail"})
		if err != nil {
			t.Fatal(err)
		}
		contexts = append(contexts, ic)
	}

	type expectedScope struct {
		artifactID uuid.UUID
		snapshotID uuid.UUID
		releaseID  uuid.UUID
		buildID    int64
	}
	expected := make(map[string]expectedScope, len(contexts)*2)
	for index, ic := range contexts {
		for _, locale := range []string{"en_US", "ru_RU"} {
			artifactID, err := store.RegisterPendingArtifact(ctx, ic, "blizzard_api",
				"battlenet/quest/8446", locale,
				"https://"+map[string]string{"en_US": "us", "ru_RU": "eu"}[locale]+".api.blizzard.com/data/wow/quest/8446?locale="+locale,
				map[string]any{"integration_test": "unavailable_detail", "release_index": index})
			if err != nil {
				t.Fatal(err)
			}
			scopeKey := contexts[index].SnapshotID.String() + "/" + locale
			expected[scopeKey] = expectedScope{
				artifactID: artifactID,
				snapshotID: ic.SnapshotID,
				releaseID:  releaseIDs[index],
				buildID:    ic.BuildID,
			}
			if err := store.RecordBattleNetUnavailableDetail(ctx, artifactID, "quest", locale, 8446, 404,
				"https://"+map[string]string{"en_US": "us", "ru_RU": "eu"}[locale]+".api.blizzard.com/data/wow/quest/8446?locale="+locale,
				"detail_not_found"); err != nil {
				t.Fatal(err)
			}
			// Repeating the same observation must not create a duplicate record or
			// change its canonical payload.
			if err := store.RecordBattleNetUnavailableDetail(ctx, artifactID, "quest", locale, 8446, 404,
				"https://"+map[string]string{"en_US": "us", "ru_RU": "eu"}[locale]+".api.blizzard.com/data/wow/quest/8446?locale="+locale,
				"detail_not_found"); err != nil {
				t.Fatal(err)
			}
		}
	}

	var recordCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM catalog_source_records record
		JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
		WHERE artifact.artifact_key='battlenet/quest/8446' AND record.record_key='unavailable/8446'`).Scan(&recordCount); err != nil {
		t.Fatal(err)
	}
	if recordCount != len(expected) {
		t.Fatalf("unavailable detail record count = %d, want %d", recordCount, len(expected))
	}

	rows, err := pool.Query(ctx, `
		SELECT record.record_key,record.payload,artifact.id,artifact.locale,artifact.snapshot_id,
			snapshot.release_id,artifact.build_id,artifact.source,artifact.artifact_key
		FROM catalog_source_records record
		JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
		JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
		WHERE artifact.artifact_key='battlenet/quest/8446'
		ORDER BY artifact.snapshot_id,artifact.locale`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	seen := make(map[string]bool, len(expected))
	for rows.Next() {
		var (
			recordKey, locale, source, artifactKey string
			payload                                []byte
			artifactID                             uuid.UUID
			snapshotID, releaseID                  uuid.UUID
			buildID                                int64
		)
		if err := rows.Scan(&recordKey, &payload, &artifactID, &locale, &snapshotID, &releaseID, &buildID, &source, &artifactKey); err != nil {
			t.Fatal(err)
		}
		scope, ok := expected[snapshotID.String()+"/"+locale]
		if !ok {
			t.Fatalf("unexpected unavailable detail scope snapshot=%s locale=%s", snapshotID, locale)
		}
		seen[snapshotID.String()+"/"+locale] = true
		if recordKey != "unavailable/8446" || artifactID != scope.artifactID || snapshotID != scope.snapshotID || releaseID != scope.releaseID || buildID != scope.buildID || source != "blizzard_api" || artifactKey != "battlenet/quest/8446" {
			t.Fatalf("source record scope = key:%q artifact:%s snapshot:%s release:%s build:%d source:%s artifact_key:%s", recordKey, artifactID, snapshotID, releaseID, buildID, source, artifactKey)
		}
		var evidence battleNetUnavailableDetailEvidence
		if err := json.Unmarshal(payload, &evidence); err != nil {
			t.Fatal(err)
		}
		wantURL := "https://" + map[string]string{"en_US": "us", "ru_RU": "eu"}[locale] + ".api.blizzard.com/data/wow/quest/8446?locale=" + locale
		want := battleNetUnavailableDetailEvidence{
			EntityType: "quest", ExternalID: 8446, Locale: locale, Status: "unavailable",
			HTTPStatus: 404, SourceURL: wantURL, Reason: "detail_not_found",
		}
		if evidence != want {
			t.Fatalf("unavailable detail payload = %#v, want %#v", evidence, want)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(seen) != len(expected) {
		t.Fatalf("scoped unavailable detail records = %d, want %d", len(seen), len(expected))
	}
}
