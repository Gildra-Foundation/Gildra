//go:build integration

package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogrelease"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// A DB2 stage stopped between tables must keep the tables it proved: the next
// attempt of the same release downloads only the rest, and the completed
// import closes the failure the stopped attempt left open.
func TestFreshnessStoppedDB2ImportKeepsProvedTables(t *testing.T) {
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

	var mu sync.Mutex
	requests := map[string]int{}
	secondTableUp := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		table := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/db2/"), "/csv")
		mu.Lock()
		requests[table]++
		up := secondTableUp
		mu.Unlock()
		switch {
		case table == "GemProperties":
			fmt.Fprint(w, "ID,EnchantId,Type\n1,10,2\n2,11,4\n3,12,8\n")
		case table == "ItemBonus" && up:
			fmt.Fprint(w, "ID,ParentItemBonusListID,Type\n7,70,1\n8,80,2\n")
		case table == "ItemBonusList" && up:
			fmt.Fprint(w, "ID,Flags\n9,0\n")
		default:
			http.Error(w, "upstream stopped", http.StatusBadGateway)
		}
	}))
	defer server.Close()
	client := wago.New(wago.Config{BaseURL: server.URL, HTTPClient: server.Client(), RetryMax: 1, RetryDelay: time.Millisecond})

	const version, build = "12.1.5.70950", 70950
	var pipelineRun int64
	if err := pool.QueryRow(ctx, `INSERT INTO catalog_pipeline_runs(pipeline_key,trigger_kind,mode,status,product,publication_environment) VALUES('freshness-db2-test','manual','apply','failed','wow','staging') RETURNING id`).Scan(&pipelineRun); err != nil {
		t.Fatal(err)
	}
	manager := catalogrelease.NewManager(pool)
	release, err := manager.Start(ctx, pipelineRun, "wow", version, []string{"db2"})
	if err != nil {
		t.Fatal(err)
	}
	store := catalogimport.NewStore(pool)
	opts := options{product: "wow", version: version, tables: []string{"GemProperties", "ItemBonus"}, locales: []string{"en_US"}, batchSize: 100, download: true}
	parameters := map[string]any{"product": opts.product, "tables": opts.tables, "locales": opts.locales,
		"max_records_per_table": 0, "batch_size": opts.batchSize, "resumable_tables": "v1"}

	first, err := store.Begin(ctx, "wow", build, version, "us", "wago_tools", &release, parameters)
	if err != nil {
		t.Fatal(err)
	}
	var seen, written int64
	importErr := importTables(ctx, pool, client, store, first, opts, true, &seen, &written)
	if importErr == nil {
		t.Fatal("the second table was expected to stop the stage")
	}
	if err := store.Finish(ctx, first.RunID, "FAILED", seen, written, importErr); err != nil {
		t.Fatal(err)
	}
	if err := manager.Fail(ctx, release, importErr); err != nil {
		t.Fatal(err)
	}
	if err := manager.Resume(ctx, release, pipelineRun, "wow", version, []string{"db2"}); err != nil {
		t.Fatal(err)
	}
	// The first importer was in fact killed before it could record its end
	// (SIGKILL 30 s after the deadline): its run is still marked running.
	if _, err := pool.Exec(ctx, `UPDATE catalog_import_runs SET status='RUNNING',finished_at=NULL,error_summary='',failure_code='' WHERE id=$1`, first.RunID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM catalog_import_failure_queue WHERE import_run_id=$1`, first.RunID); err != nil {
		t.Fatal(err)
	}

	// A deploy between the two attempts added a table: proved tables are kept.
	opts.tables = append(opts.tables, "ItemBonusList")
	parameters = map[string]any{"product": opts.product, "tables": opts.tables, "locales": opts.locales,
		"max_records_per_table": 0, "batch_size": opts.batchSize, "resumable_tables": "v1"}
	second, err := store.Begin(ctx, "wow", build, version, "us", "wago_tools", &release, parameters)
	if err != nil {
		t.Fatal(err)
	}
	if second.SnapshotID != first.SnapshotID {
		t.Fatal("the proved table was discarded with its snapshot")
	}
	var takenOver string
	if err := pool.QueryRow(ctx, `SELECT status FROM catalog_import_runs WHERE id=$1`, first.RunID).Scan(&takenOver); err != nil {
		t.Fatal(err)
	}
	if takenOver != "FAILED" {
		t.Fatalf("the killed importer of the continued snapshot is still %s", takenOver)
	}
	mu.Lock()
	secondTableUp = true
	mu.Unlock()
	seen, written = 0, 0
	if err := importTables(ctx, pool, client, store, second, opts, true, &seen, &written); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, second.RunID, "SUCCEEDED", seen, written, nil); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	gem, bonus := requests["GemProperties"], requests["ItemBonus"]
	mu.Unlock()
	if gem != 1 {
		t.Fatalf("the proved table was downloaded %d times, want once", gem)
	}
	if bonus < 2 {
		t.Fatalf("the stopped table was requested %d times, want a retry", bonus)
	}
	if seen != 6 || written != 3 {
		t.Fatalf("resumed counters seen=%d written=%d, want 6 and 3", seen, written)
	}
	var ready, rows, open int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_source_artifacts WHERE snapshot_id=$1 AND status='ready' AND content_hash IS NOT NULL`, second.SnapshotID).Scan(&ready); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_db2_rows WHERE build_id=$1`, second.BuildID).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM catalog_import_runs run
		LEFT JOIN catalog_import_failure_queue queue ON queue.import_run_id=run.id
		WHERE run.build_id=$1 AND run.status='FAILED' AND COALESCE(queue.state,'quarantined')<>'resolved'`, second.BuildID).Scan(&open); err != nil {
		t.Fatal(err)
	}
	var running int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_import_runs WHERE build_id=$1 AND status='RUNNING'`, second.BuildID).Scan(&running); err != nil {
		t.Fatal(err)
	}
	if running != 0 {
		t.Fatalf("%d imports of the build are still marked running", running)
	}
	if ready != 3 || rows != 6 || open != 0 {
		t.Fatalf("ready artifacts=%d rows=%d open failures=%d, want 3, 6 and 0", ready, rows, open)
	}

	// A proved table whose rows no longer match its measurement is imported again.
	if _, err := pool.Exec(ctx, `DELETE FROM catalog_db2_rows WHERE build_id=$1 AND table_name='GemProperties' AND row_id=3`, second.BuildID); err != nil {
		t.Fatal(err)
	}
	if _, kept, err := retainedTableRows(ctx, pool, second, "GemProperties", "en_US", client.CSVURL("GemProperties", version, "enUS")); err != nil || kept {
		t.Fatalf("a table with missing rows was retained: %t %v", kept, err)
	}
	if errors.Is(importErr, context.Canceled) {
		t.Fatal("unexpected cancellation")
	}
}
