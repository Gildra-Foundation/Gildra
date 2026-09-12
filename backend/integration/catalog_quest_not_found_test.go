//go:build integration

package integration

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// TestRetailQuestOfficialNotFoundConfirmation proves that unavailable detail
// records are a conservative usability input: one sweep, a build mismatch,
// and incomplete/transient artifacts remain review, while two complete
// bilingual sweeps separated by a day can exclude only a non-technical quest
// without a successful official document/localization.
func TestRetailQuestOfficialNotFoundConfirmation(t *testing.T) {
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
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}

	var productID int16
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	const buildNumber = 1630001
	const buildVersion = "12.1.0.1630001"
	var buildID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,$2,$3,true) RETURNING id`, productID, buildNumber, buildVersion).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	var namespaceID int16
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_namespaces(product_id,region,kind,slug)
		VALUES($1,'us','static','static-us')
		ON CONFLICT(product_id,slug) DO UPDATE SET region=EXCLUDED.region
		RETURNING id`, productID).Scan(&namespaceID); err != nil {
		t.Fatal(err)
	}

	publishedSnapshot := insertSnapshot(t, ctx, database, productID, buildID, "published", time.Now().UTC())
	questIDs := []int64{163001, 163002, 163003, 163004, 163005, 163006, 163007, 163008}
	versionIDs := make(map[int64]string, len(questIDs))
	for _, questID := range questIDs {
		versionIDs[questID] = insertQuest(t, ctx, database, productID, namespaceID, buildID, publishedSnapshot, questID, "", "")
	}
	// The baseline classifier must continue to publish the existing bilingual
	// proof, independently of any unavailable-detail policy.
	setQuestLocalization(t, ctx, database, versionIDs[163005], "en_US", "Eligible Quest")
	setQuestLocalization(t, ctx, database, versionIDs[163005], "ru_RU", "Доступный квест")
	wagoArtifact := insertArtifact(t, ctx, database, publishedSnapshot, buildID, "wago_tools", "wago/quest-proof", "en_US", "ready", buildNumber, buildVersion, time.Now().UTC())
	for _, locale := range []string{"en_US", "ru_RU"} {
		if _, err := database.ExecContext(ctx, `
			INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
			VALUES($1,$2,$3)`, versionIDs[163005], locale, wagoArtifact); err != nil {
			t.Fatal(err)
		}
	}
	// Technical markers retain the baseline exclusion priority even with two
	// complete official 404 sweeps.
	setQuestLocalization(t, ctx, database, versionIDs[163004], "en_US", "[DNT] Internal Quest")

	now := time.Now().UTC()
	staleMismatchSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now.Add(-72*time.Hour))
	oldSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now.Add(-48*time.Hour))
	recoverySweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now.Add(-24*time.Hour))
	newSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now)
	latestMismatchSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now.Add(time.Hour))
	for _, snapshotID := range []string{oldSweep, newSweep} {
		for _, questID := range []int64{163001, 163004, 163006} {
			for _, locale := range []string{"en_US", "ru_RU"} {
				insertUnavailable(t, ctx, database, snapshotID, buildID, questID, locale, "ready", buildNumber, buildVersion, now)
			}
		}
	}
	// An old mismatch is superseded by two newer matching sweeps.
	for _, locale := range []string{"en_US", "ru_RU"} {
		insertUnavailable(t, ctx, database, staleMismatchSweep, buildID, 163003, locale, "ready", buildNumber+1, "12.1.0.1630002", now)
		insertUnavailable(t, ctx, database, oldSweep, buildID, 163008, locale, "ready", buildNumber, buildVersion, now)
		insertUnavailable(t, ctx, database, recoverySweep, buildID, 163003, locale, "ready", buildNumber, buildVersion, now)
		insertUnavailable(t, ctx, database, newSweep, buildID, 163003, locale, "ready", buildNumber, buildVersion, now)
	}

	// A single completed sweep is not enough to exclude a quest.
	oneSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now)
	for _, locale := range []string{"en_US", "ru_RU"} {
		insertUnavailable(t, ctx, database, oneSweep, buildID, 163002, locale, "ready", buildNumber, buildVersion, now)
	}

	// A complete pair with a client build mismatch remains review with an
	// explicit reason, even though its source records are otherwise well formed.
	for _, locale := range []string{"en_US", "ru_RU"} {
		insertUnavailable(t, ctx, database, latestMismatchSweep, buildID, 163008, locale, "ready", buildNumber+1, "12.1.0.1630002", now.Add(time.Hour))
	}

	// Failed/transient artifacts never count as a complete sweep.
	transientSweep := insertSnapshot(t, ctx, database, productID, buildID, "validated", now.Add(48*time.Hour))
	for _, locale := range []string{"en_US", "ru_RU"} {
		insertUnavailable(t, ctx, database, transientSweep, buildID, 163007, locale, "failed", buildNumber, buildVersion, now.Add(48*time.Hour))
	}

	// A successful official document prevents the not-found exclusion even
	// when the unavailable evidence itself is otherwise sufficient.
	officialArtifact := insertArtifact(t, ctx, database, publishedSnapshot, buildID, "blizzard_api", "battlenet/quest", "en_US", "ready", buildNumber, buildVersion, now)
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_entity_source_documents(
			build_id,entity_type,external_id,source,locale,payload,content_hash,source_url,source_artifact_id)
		VALUES($1,'quest',163006,'blizzard_api','en_US','{"id":163006,"name":"Official Quest"}'::jsonb,
			decode(repeat('ef',32),'hex'),'https://us.api.blizzard.com/data/wow/quest/163006',$2)`, buildID, officialArtifact); err != nil {
		t.Fatal(err)
	}

	var refreshed int64
	if err := database.QueryRowContext(ctx, `SELECT catalog_refresh_quest_usability($1)`, buildID).Scan(&refreshed); err != nil {
		t.Fatal(err)
	}
	if refreshed == 0 {
		t.Fatal("quest usability refresh did not process fixture rows")
	}

	assertQuestUsability(t, ctx, database, productID, buildID, 163001, "excluded", "official_not_found_confirmed")
	assertQuestUsability(t, ctx, database, productID, buildID, 163002, "review", "missing_english_name")
	assertQuestUsability(t, ctx, database, productID, buildID, 163003, "excluded", "official_not_found_confirmed")
	assertQuestUsability(t, ctx, database, productID, buildID, 163004, "excluded", "technical_or_placeholder_marker")
	assertQuestUsability(t, ctx, database, productID, buildID, 163005, "eligible", "verified_bilingual_localization")
	assertQuestUsability(t, ctx, database, productID, buildID, 163006, "review", "missing_english_name")
	assertQuestUsability(t, ctx, database, productID, buildID, 163007, "review", "missing_english_name")
	assertQuestUsability(t, ctx, database, productID, buildID, 163008, "review", "official_not_found_build_mismatch")
	assertQuestEvidence(t, ctx, database, productID, buildID, 163001, "official_not_found", "confirmed")
	assertQuestEvidence(t, ctx, database, productID, buildID, 163008, "official_not_found", "build_mismatch")

	var entityCount, recordCount int
	if err := database.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM game_entities WHERE product_id=$1 AND entity_type='quest' AND external_id BETWEEN 163001 AND 163008),
			(SELECT count(*) FROM catalog_source_records record
			 JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
			 WHERE artifact.build_id=$2 AND record.record_key LIKE 'unavailable/%')`, productID, buildID).Scan(&entityCount, &recordCount); err != nil {
		t.Fatal(err)
	}
	if entityCount != len(questIDs) || recordCount != 26 {
		t.Fatalf("raw fixture data changed: entities=%d records=%d", entityCount, recordCount)
	}
}

func insertSnapshot(t *testing.T, ctx context.Context, database *sql.DB, productID int16, buildID int64, status string, createdAt time.Time) string {
	t.Helper()
	var snapshotID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,metadata,created_at)
		VALUES($1,$2,'blizzard_api',$3,'{"integration_test":true}'::jsonb,$4)
		RETURNING id::text`, productID, buildID, status, createdAt).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	return snapshotID
}

func insertQuest(t *testing.T, ctx context.Context, database *sql.DB, productID int16, namespaceID int16, buildID int64, snapshotID string, questID int64, enName, ruName string) string {
	t.Helper()
	var entityID, versionID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
		VALUES($1::smallint,$2::smallint,'quest',$3::bigint,concat('quest-fixture-',$3::bigint),$4::bigint,$4::bigint)
		RETURNING id::text`, productID, namespaceID, questID, buildID).Scan(&entityID); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id)
		VALUES($1,$2,decode(repeat('ab',32),'hex'),jsonb_build_object('registry_only',true),
			'https://example.invalid/quest-fixture',$3)
		RETURNING id::text`, entityID, buildID, snapshotID).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `UPDATE game_entities SET latest_version_id=$1,published_version_id=$1 WHERE id=$2`, versionID, entityID); err != nil {
		t.Fatal(err)
	}
	if enName != "" {
		setQuestLocalization(t, ctx, database, versionID, "en_US", enName)
	}
	if ruName != "" {
		setQuestLocalization(t, ctx, database, versionID, "ru_RU", ruName)
	}
	return versionID
}

func setQuestLocalization(t *testing.T, ctx context.Context, database *sql.DB, versionID, locale, name string) {
	t.Helper()
	if _, err := database.ExecContext(ctx, `
		INSERT INTO game_entity_localizations(version_id,locale,name,description)
		VALUES($1,$2,$3,'')`, versionID, locale, name); err != nil {
		t.Fatal(err)
	}
}

func insertArtifact(t *testing.T, ctx context.Context, database *sql.DB, snapshotID string, buildID int64, source, key, locale, status string, sourceBuildNumber int, sourceBuildVersion string, fetchedAt time.Time) string {
	t.Helper()
	var artifactID string
	metadata := fmt.Sprintf(`{"source_build_number":%d,"source_build_version":%q}`, sourceBuildNumber, sourceBuildVersion)
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,locale,source_url,status,metadata,content_hash,byte_size,fetched_at)
		VALUES($1,$2,$3,$4,$5,'https://example.invalid/quest-sweep',$6,$7::jsonb,
			CASE WHEN $6='ready' THEN decode(repeat('cd',32),'hex') ELSE NULL END,
			CASE WHEN $6='ready' THEN 64 ELSE NULL END,$8)
		RETURNING id::text`, snapshotID, buildID, source, key, locale, status, metadata, fetchedAt).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	return artifactID
}

func insertUnavailable(t *testing.T, ctx context.Context, database *sql.DB, snapshotID string, buildID int64, questID int64, locale, artifactStatus string, sourceBuildNumber int, sourceBuildVersion string, fetchedAt time.Time) {
	t.Helper()
	metadata := fmt.Sprintf(`{"source_build_number":%d,"source_build_version":%q}`, sourceBuildNumber, sourceBuildVersion)
	var artifactID string
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,locale,source_url,status,metadata,content_hash,byte_size,fetched_at)
		VALUES($1,$2,'blizzard_api','battlenet-missing/quest',$3,'https://example.invalid/quest-sweep',$4,$5::jsonb,
			CASE WHEN $4='ready' THEN decode(repeat('cd',32),'hex') ELSE NULL END,
			CASE WHEN $4='ready' THEN 64 ELSE NULL END,$6)
		ON CONFLICT(snapshot_id,artifact_key,locale) DO UPDATE SET
			status=EXCLUDED.status,metadata=EXCLUDED.metadata,
			content_hash=EXCLUDED.content_hash,byte_size=EXCLUDED.byte_size,fetched_at=EXCLUDED.fetched_at
		RETURNING id::text`, snapshotID, buildID, locale, artifactStatus, metadata, fetchedAt).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"entity_type": "quest", "external_id": questID, "locale": locale,
		"status": "unavailable", "http_status": 404,
		"source_url": "https://example.invalid/quest/" + fmt.Sprint(questID),
		"reason":     "detail_not_found",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO catalog_source_records(artifact_id,record_key,payload,content_hash)
		VALUES($1,$2,$3::jsonb,decode(repeat('de',32),'hex'))`, artifactID, "unavailable/"+fmt.Sprint(questID), payload); err != nil {
		t.Fatal(err)
	}
}

func assertQuestUsability(t *testing.T, ctx context.Context, database *sql.DB, productID int16, buildID, questID int64, wantDecision, wantReason string) {
	t.Helper()
	var decision, reason string
	if err := database.QueryRowContext(ctx, `
		SELECT decision,reason_code
		FROM catalog_entity_usability
		WHERE product_id=$1 AND build_id=$2 AND entity_type='quest' AND external_id=$3`, productID, buildID, questID).Scan(&decision, &reason); err != nil {
		t.Fatalf("quest %d usability: %v", questID, err)
	}
	if decision != wantDecision || reason != wantReason {
		t.Fatalf("quest %d usability = %s/%s, want %s/%s", questID, decision, reason, wantDecision, wantReason)
	}
}

func assertQuestEvidence(t *testing.T, ctx context.Context, database *sql.DB, productID int16, buildID, questID int64, key, want string) {
	t.Helper()
	var value string
	if err := database.QueryRowContext(ctx, `
		SELECT evidence->>$4
		FROM catalog_entity_usability
		WHERE product_id=$1 AND build_id=$2 AND entity_type='quest' AND external_id=$3`, productID, buildID, questID, key).Scan(&value); err != nil {
		t.Fatalf("quest %d evidence %s: %v", questID, key, err)
	}
	if value != want {
		t.Fatalf("quest %d evidence[%s] = %q, want %q", questID, key, value, want)
	}
}
