//go:build integration

package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// An item set that only the client table knows gets its names from that table
// and from nowhere else. Their proof must be recorded from the rows that were
// read, also when the release's pointers were rolled back after a failed
// validation (the record is hidden and has no current version).
func TestCollectionLocalizationProofIsRecordedWithoutPointers(t *testing.T) {
	dsn := os.Getenv("FRESHNESS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("explicit disposable DB required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	database, err := sql.Open("pgx", dsn)
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
	goose.SetLogger(goose.NopLogger())
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	const version, build = "12.1.5.70960", 70960
	store := catalogimport.NewStore(pool)
	ic, err := store.Begin(ctx, "wow", build, version, "us", "wago_tools", nil, map[string]any{"fixture": "collection_localization_proof"})
	if err != nil {
		t.Fatal(err)
	}
	artifact := func(locale, status string) uuid.UUID {
		t.Helper()
		id, err := store.RegisterPendingArtifact(ctx, ic, "wago_tools", "ItemSet", locale, "https://example.test/ItemSet?locale="+locale, map[string]any{})
		if err != nil {
			t.Fatal(err)
		}
		if status == "ready" {
			if err := store.CompleteArtifact(ctx, id, make([]byte, 32), 1, ""); err != nil {
				t.Fatal(err)
			}
		}
		return id
	}
	english, russian := artifact("en_US", "ready"), artifact("ru_RU", "fetching")
	rows := []struct {
		locale   string
		artifact uuid.UUID
		name     string
	}{{"en_US", english, "Merciless Gladiator's Aegis"}, {"ru_RU", russian, "Эгида безжалостного гладиатора"}}
	for _, row := range rows {
		if _, err := pool.Exec(ctx, `
			INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,snapshot_id,source_artifact_id)
			VALUES($1,'ItemSet',$2,700,jsonb_build_object('ID','700','Name_lang',$3::text),decode(repeat('cd',32),'hex'),'https://example.test',$4,$5)`,
			ic.BuildID, row.locale, row.name, ic.SnapshotID, row.artifact); err != nil {
			t.Fatal(err)
		}
	}
	// The record as a failed release leaves it: hidden, without a current version.
	var entityID, versionID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id,deleted_at)
		VALUES($1,$2,'item_set',700,'merciless-gladiator-s-aegis',$3,$3,now()) RETURNING id`, ic.ProductID, ic.NamespaceID, ic.BuildID).Scan(&entityID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
		VALUES($1,$2,1,decode(repeat('cd',32),'hex'),'{"name":"Merciless Gladiator''s Aegis"}','https://example.test',$3,$4) RETURNING id`,
		entityID, ic.BuildID, ic.SnapshotID, english).Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if _, err := pool.Exec(ctx, `INSERT INTO game_entity_localizations(version_id,locale,slug,name,description) VALUES($1,$2,'merciless-gladiator-s-aegis',$3,'')`, versionID, row.locale, row.name); err != nil {
			t.Fatal(err)
		}
	}
	proofs := func() map[string]uuid.UUID {
		t.Helper()
		found := map[string]uuid.UUID{}
		result, err := pool.Query(ctx, `SELECT locale,source_artifact_id FROM catalog_entity_localization_artifacts WHERE version_id=$1`, versionID)
		if err != nil {
			t.Fatal(err)
		}
		defer result.Close()
		for result.Next() {
			var locale string
			var id uuid.UUID
			if err := result.Scan(&locale, &id); err != nil {
				t.Fatal(err)
			}
			found[locale] = id
		}
		return found
	}

	// Another table's request does not touch item sets.
	if recorded, err := observeCollectionLocalizationArtifacts(ctx, pool, ic, []string{"Mount"}); err != nil || recorded != 0 {
		t.Fatalf("an unrelated table recorded %d proofs: %v", recorded, err)
	}
	// Only the locale whose artifact is complete can be proved.
	if missing, err := missingCollectionLocalizationArtifacts(ctx, pool, ic, []string{"ItemSet"}); err != nil || missing != 1 {
		t.Fatalf("missing proofs before the repair: %d %v, want 1", missing, err)
	}
	if recorded, err := observeCollectionLocalizationArtifacts(ctx, pool, ic, []string{"ItemSet"}); err != nil || recorded != 1 {
		t.Fatalf("recorded %d proofs: %v, want 1", recorded, err)
	}
	if got := proofs(); len(got) != 1 || got["en_US"] != english {
		t.Fatalf("proofs after the first pass: %v", got)
	}
	if err := store.CompleteArtifact(ctx, russian, make([]byte, 32), 1, ""); err != nil {
		t.Fatal(err)
	}
	if recorded, err := observeCollectionLocalizationArtifacts(ctx, pool, ic, []string{"ItemSet"}); err != nil || recorded != 1 {
		t.Fatalf("recorded %d proofs once the Russian table was proved: %v, want 1", recorded, err)
	}
	if got := proofs(); len(got) != 2 || got["en_US"] != english || got["ru_RU"] != russian {
		t.Fatalf("each locale must be proved by its own table: %v", got)
	}
	if missing, err := missingCollectionLocalizationArtifacts(ctx, pool, ic, []string{"ItemSet"}); err != nil || missing != 0 {
		t.Fatalf("missing proofs after the repair: %d %v", missing, err)
	}
	if recorded, err := observeCollectionLocalizationArtifacts(ctx, pool, ic, nil); err != nil || recorded != 0 {
		t.Fatalf("a repeated pass recorded %d proofs: %v", recorded, err)
	}
	// Nothing but proof rows changed: the record is still hidden and unpublished.
	var hidden bool
	var pointers int
	if err := pool.QueryRow(ctx, `SELECT deleted_at IS NOT NULL,(latest_version_id IS NOT NULL)::int+(published_version_id IS NOT NULL)::int FROM game_entities WHERE id=$1`, entityID).Scan(&hidden, &pointers); err != nil {
		t.Fatal(err)
	}
	if !hidden || pointers != 0 {
		t.Fatal(fmt.Sprintf("the repair changed the record itself: hidden=%t pointers=%d", hidden, pointers))
	}
}
