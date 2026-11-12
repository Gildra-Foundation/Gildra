//go:build integration

package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// This opt-in acceptance harness requires an empty disposable database with
// the full migrated schema and a read-only source export. Test artifacts are
// explicitly synthetic; no production provenance is fabricated or modified.
func TestQuestRealSourceProjection(t *testing.T) {
	url, directory := os.Getenv("QUEST_TEST_DATABASE_URL"), os.Getenv("QUEST_SOURCE_DIRECTORY")
	if url == "" || directory == "" {
		t.Skip("QUEST_TEST_DATABASE_URL and QUEST_SOURCE_DIRECTORY required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var existing int
	if err = db.QueryRow(ctx, "SELECT count(*) FROM game_entities").Scan(&existing); err != nil {
		t.Fatal(err)
	}
	resume := os.Getenv("QUEST_TEST_REPLAY_RESUME") == "1"
	if existing != 0 && !resume {
		t.Fatal("refusing source replay into a nonempty catalog")
	}
	if resume {
		var replayRows int
		if err := db.QueryRow(ctx, "SELECT count(*) FROM quest_test_entities").Scan(&replayRows); err != nil || replayRows == 0 {
			t.Fatal("resume requires the explicit nonempty quest replay marker", err)
		}
	}
	store := catalogimport.NewStore(db)
	ic, err := store.Begin(ctx, "wow", 69587, "12.1.0.69587", "us", "wago_tools", nil, map[string]any{"test": "quest source replay"})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := store.RegisterArtifact(ctx, ic, "wago_tools", "quest-source-export", "en_US", "https://example.invalid/quest-source-export", map[string]any{"test": true})
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256([]byte("quest-source-test-export"))
	if err = store.CompleteArtifact(ctx, artifact, hash[:], 1, ""); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	load := func(file, table string) {
		t.Helper()
		f, err := os.Open(filepath.Join(directory, file))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 65536), 4*1024*1024)
		var batch [][]any
		flush := func() {
			if len(batch) == 0 {
				return
			}
			if _, err := db.CopyFrom(ctx, pgx.Identifier{table}, []string{"doc"}, pgx.CopyFromRows(batch)); err != nil {
				t.Fatal(err)
			}
			batch = nil
		}
		for scanner.Scan() {
			batch = append(batch, []any{json.RawMessage(append([]byte(nil), scanner.Bytes()...))})
			if len(batch) == 1000 {
				flush()
			}
		}
		flush()
		if err = scanner.Err(); err != nil {
			t.Fatal(err)
		}
	}
	if !resume {
		exec("CREATE UNLOGGED TABLE quest_test_raw(doc jsonb); CREATE UNLOGGED TABLE quest_test_entities(doc jsonb)")
		load("raw.jsonl", "quest_test_raw")
		load("entities.jsonl", "quest_test_entities")
		exec(`INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,source_artifact_id)
 SELECT $1,doc->>'table_name',doc->>'locale',(doc->>'row_id')::bigint,doc->'payload',digest((doc->'payload')::text,'sha256'),doc->>'source_url',$2 FROM quest_test_raw`, ic.BuildID, artifact)
		exec(`INSERT INTO game_entities(id,product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
 SELECT (doc->>'id')::uuid,$1,$2,doc->>'type',(doc->>'external_id')::bigint,doc->>'slug',$3,$3 FROM quest_test_entities`, ic.ProductID, ic.NamespaceID, ic.BuildID)
		exec(`INSERT INTO game_entity_versions(id,entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id)
 SELECT (doc->>'version_id')::uuid,(doc->>'id')::uuid,$1,digest((doc->'payload')::text,'sha256'),doc->'payload','https://example.invalid/replay',$2,$3 FROM quest_test_entities`, ic.BuildID, ic.SnapshotID, artifact)
		exec(`INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
 SELECT (doc->>'version_id')::uuid,l->>'locale',l->>'slug',l->>'name',l->>'description',l->'attributes' FROM quest_test_entities CROSS JOIN LATERAL jsonb_array_elements(doc->'locales') l`)
		exec(`UPDATE game_entities e SET latest_version_id=(s.doc->>'version_id')::uuid,published_version_id=(s.doc->>'version_id')::uuid FROM quest_test_entities s WHERE e.id=(s.doc->>'id')::uuid`)
		exec(`INSERT INTO catalog_entity_usability(product_id,build_id,entity_type,external_id,decision,reason_code)
 SELECT $1,$2,doc->>'type',(doc->>'external_id')::bigint,doc#>>'{usability,decision}',doc#>>'{usability,reason_code}'
 FROM quest_test_entities WHERE doc->'usability' IS NOT NULL AND doc->'usability'<>'null'::jsonb`, ic.ProductID, ic.BuildID)
		exec("ANALYZE catalog_db2_rows; ANALYZE game_entities; ANALYZE game_entity_versions; ANALYZE game_entity_localizations")
	}
	exec("ANALYZE catalog_db2_rows; ANALYZE game_entities; ANALYZE game_entity_versions; ANALYZE game_entity_localizations; ANALYZE catalog_quest_registry")
	repeats := 2
	if resume {
		repeats = 1
	}
	for repeat := 0; repeat < repeats; repeat++ {
		start := time.Now()
		n, err := projectQuests(ctx, db, ic)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("projection %d registry %d elapsed %s", repeat, n, time.Since(start))
	}
	var source, projected, localized, missing, maps int
	for _, check := range []struct {
		query string
		dest  *int
	}{
		{`SELECT count(*) FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestObjective' AND locale='en_US' AND (payload->>'QuestID')::bigint>0`, &source},
		{`SELECT count(*) FROM catalog_quest_objectives WHERE build_id=$1`, &projected},
		{`SELECT count(*) FROM catalog_quest_objective_localizations WHERE build_id=$1`, &localized},
		{`SELECT count(*) FROM catalog_db2_rows r LEFT JOIN catalog_quest_objective_localizations l ON l.build_id=r.build_id AND l.quest_id=(r.payload->>'QuestID')::bigint AND l.objective_id=r.row_id AND l.locale=r.locale WHERE r.build_id=$1 AND r.table_name='QuestObjective' AND (r.payload->>'QuestID')::bigint>0 AND (l.objective_id IS NULL OR l.description IS DISTINCT FROM COALESCE(r.payload->>'Description_lang',''))`, &missing},
		{`SELECT count(*) FROM catalog_quest_poi_blobs WHERE build_id=$1 AND map_id=0`, &maps},
	} {
		if err := db.QueryRow(ctx, check.query, ic.BuildID).Scan(check.dest); err != nil {
			t.Fatal(err)
		}
	}
	if source != projected || localized != source*2 || missing != 0 || maps == 0 {
		t.Fatalf("source=%d projected=%d localized=%d missing=%d map0=%d", source, projected, localized, missing, maps)
	}
	t.Logf("source=%d projected=%d localized=%d exact-text mismatches=%d Eastern Kingdoms POIs=%d", source, projected, localized, missing, maps)
	exec(`CREATE TABLE IF NOT EXISTS quest_test_context(build_id bigint,artifact_id uuid); DELETE FROM quest_test_context; INSERT INTO quest_test_context VALUES($1,$2)`, pgx.QueryExecModeSimpleProtocol, ic.BuildID, artifact)
}
