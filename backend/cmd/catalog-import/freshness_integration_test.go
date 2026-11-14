//go:build integration

package main

import (
	"context"
	"database/sql"
	"encoding/json"
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

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogrelease"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func TestFreshnessInterruptedEnrichmentResumes(t *testing.T) {
	dsn := os.Getenv("FRESHNESS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("explicit disposable DB required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var runID int64
	if err := pool.QueryRow(ctx, `INSERT INTO catalog_pipeline_runs(pipeline_key,trigger_kind,mode,status,product,publication_environment) VALUES('freshness-test','manual','apply','failed','wow','staging') RETURNING id`).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	manager := catalogrelease.NewManager(pool)
	release, err := manager.Start(ctx, runID, "wow", "12.1.5.70783", []string{"battlenet"})
	if err != nil {
		t.Fatal(err)
	}
	store := catalogimport.NewStore(pool)
	base, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "wago_tools", &release, map[string]any{"fixture": true})
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := store.RegisterPendingArtifact(ctx, base, "wago_tools", "QuestV2CliTask", "en_US", "https://example.test", map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{1, 2, 3} {
		payload := json.RawMessage(fmt.Sprintf(`{"id":%d,"name":"Quest %d"}`, id, id))
		if err := store.UpsertCanonical(ctx, base, catalogimport.Record{Type: "quest", ExternalID: id, Locale: "en_US", Payload: payload, SourceURL: "https://example.test", SourceArtifactID: &artifact}); err != nil {
			t.Fatal(err)
		}
		if _, err := store.UpsertSourceRecord(ctx, artifact, fmt.Sprint(id), payload); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.CompleteArtifactFromRecords(ctx, artifact); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, base.RunID, "SUCCEEDED", 3, 3, nil); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	requests := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"fixture","token_type":"bearer","expires_in":3600}`)
			return
		}
		mu.Lock()
		requests[r.URL.Path]++
		mu.Unlock()
		if strings.HasSuffix(r.URL.Path, "/3") {
			fmt.Fprint(w, `{"id":3,"title":"Quest three"}`)
			return
		}
		w.WriteHeader(404)
		fmt.Fprint(w, `{"code":404}`)
	}))
	defer server.Close()
	client, err := battlenet.New(battlenet.Config{ClientID: "fixture", ClientSecret: "fixture", HTTPClient: server.Client(), TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	params := map[string]any{"missing_only": true, "resumable_enrichment": "v1", "source_build_version": "12.1.5.70783"}
	ic, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "battlenet", &release, params)
	if err != nil {
		t.Fatal(err)
	}
	opts := options{missingOnly: true, entityTypes: []string{"quest"}, locales: []string{"en_US"}, product: "wow", sourceBuildVersion: "12.1.5.70783", sourceBuildNumber: 70783, detailWorkers: 1, enrichmentSliceRecords: 1}
	var seen, written int64
	err = importBattleNet(ctx, client, store, ic, opts, &seen, &written)
	if !errors.Is(err, errEnrichmentSliceComplete) {
		t.Fatalf("slice result: %v", err)
	}
	if err := store.Finish(ctx, ic.RunID, "FAILED", seen, written, err); err != nil {
		t.Fatal(err)
	}
	if err := manager.Fail(ctx, release, errEnrichmentSliceComplete); err != nil {
		t.Fatal(err)
	}
	if err := manager.Publish(ctx, release); err == nil {
		t.Fatal("partial enrichment published")
	}
	if err := manager.Resume(ctx, release, runID, "wow", "12.1.5.70783", []string{"battlenet"}); err != nil {
		t.Fatal(err)
	}
	changedSource := map[string]any{"missing_only": true, "resumable_enrichment": "v1", "source_build_version": "12.1.5.70078"}
	if _, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "battlenet", &release, changedSource); err == nil {
		t.Fatal("changed source namespace reused checkpoints")
	}
	resumed, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "battlenet", &release, params)
	if err != nil {
		t.Fatal(err)
	}
	if resumed.SnapshotID != ic.SnapshotID {
		t.Fatal("checkpoint snapshot discarded")
	}
	opts.enrichmentSliceRecords = 0
	if err := importBattleNet(ctx, client, store, resumed, opts, &seen, &written); err != nil {
		t.Fatal(err)
	}
	if err := store.Finish(ctx, resumed.RunID, "SUCCEEDED", seen, written, nil); err != nil {
		t.Fatal(err)
	}
	var unresolved int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_import_failure_queue q JOIN catalog_import_runs r ON r.id=q.import_run_id WHERE r.snapshot_id=$1 AND q.state<>'resolved'`, ic.SnapshotID).Scan(&unresolved); err != nil {
		t.Fatal(err)
	}
	if unresolved != 0 {
		t.Fatal("completed resumed snapshot left unresolved failures")
	}
	mu.Lock()
	defer mu.Unlock()
	for _, id := range []int{1, 2, 3} {
		path := fmt.Sprintf("/data/wow/quest/%d", id)
		if requests[path] != 1 {
			t.Fatalf("%s fetched %d times; expected once across interruption", path, requests[path])
		}
	}
	var ready int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM catalog_source_artifacts WHERE snapshot_id=$1 AND status='ready' AND content_hash IS NOT NULL`, ic.SnapshotID).Scan(&ready); err != nil {
		t.Fatal(err)
	}
	if ready != 1 {
		t.Fatalf("ready artifacts=%d", ready)
	}
	// Corruption must not be silently trusted as completed work.
	var checkpointArtifact uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM catalog_source_artifacts WHERE snapshot_id=$1`, ic.SnapshotID).Scan(&checkpointArtifact); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertCanonical(ctx, base, catalogimport.Record{Type: "quest", ExternalID: 2, Locale: "en_US", Payload: json.RawMessage(`{"id":2,"name":"Upstream changed quest"}`), SourceURL: "https://example.test", SourceArtifactID: &artifact}); err != nil {
		t.Fatal(err)
	}
	if complete, err := store.BattleNetCheckpoint(ctx, resumed, "quest", checkpointArtifact, 2); err != nil || complete {
		t.Fatalf("reused checkpoint for changed canonical version: %t %v", complete, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE catalog_source_records SET payload='{"id":1,"complete":false}' WHERE artifact_id=$1::uuid AND record_key='checkpoint/1'`, checkpointArtifact); err != nil {
		t.Fatal(err)
	}
	opts.enrichmentSliceRecords = 0
	if err := importBattleNet(ctx, client, store, resumed, opts, &seen, &written); err == nil {
		t.Fatal("corrupt checkpoint accepted")
	}
	// Simulate a child killed before Finish, with its owning pipeline already
	// terminal. Reconciliation requires explicit proof and is idempotent.
	// The prior fixture release must no longer refer to this pipeline attempt.
	if _, err := pool.Exec(ctx, `UPDATE catalog_releases SET pipeline_run_id=NULL WHERE id=$1`, release); err != nil {
		t.Fatal(err)
	}
	abandoned, err := manager.Start(ctx, runID, "wow", "12.1.5.70783", []string{"battlenet"})
	if err != nil {
		t.Fatal(err)
	}
	orphan, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "battlenet", &abandoned, params)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Fail(ctx, abandoned, errors.New("test killed child")); err != nil {
		t.Fatal(err)
	}
	runner := catalogpipeline.Runner{DB: pool}
	if _, err := runner.ReconcileFailedRun(ctx, runID, "wow", false); err == nil {
		t.Fatal("unconfirmed worker reconciled")
	}

	// A connected pipeline holds the product lock: its run is never reconciled.
	live, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := live.Exec(ctx, `SELECT pg_advisory_lock(hashtextextended('gildra:catalog-pipeline:wow',0))`); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.ReconcileFailedRun(ctx, runID, "wow", true); !errors.Is(err, catalogpipeline.ErrAlreadyRunning) {
		t.Fatalf("connected pipeline reconciled: %v", err)
	}
	if _, err := live.Exec(ctx, `SELECT pg_advisory_unlock(hashtextextended('gildra:catalog-pipeline:wow',0))`); err != nil {
		t.Fatal(err)
	}
	live.Release()
	for _, want := range []int64{1, 0} {
		got, err := runner.ReconcileFailedRun(ctx, runID, "wow", true)
		if err != nil || got != want {
			t.Fatalf("reconcile=%d %v, want %d", got, err, want)
		}
	}
	var terminal string
	if err := pool.QueryRow(ctx, `SELECT status FROM catalog_import_runs WHERE id=$1`, orphan.RunID).Scan(&terminal); err != nil {
		t.Fatal(err)
	}
	if terminal != "FAILED" {
		t.Fatal(terminal)
	}

	// A pipeline killed outright leaves its run running and its release in
	// staging. With the product lock free and the worker confirmed stopped,
	// reconciliation closes both and the importer the dead pipeline left.
	if _, err := pool.Exec(ctx, `UPDATE catalog_releases SET pipeline_run_id=NULL WHERE id=$1`, abandoned); err != nil {
		t.Fatal(err)
	}
	var killedRun int64
	if err := pool.QueryRow(ctx, `INSERT INTO catalog_pipeline_runs(pipeline_key,trigger_kind,mode,status,product,publication_environment,started_at) VALUES('freshness-test','manual','apply','running','wow','staging',now()) RETURNING id`).Scan(&killedRun); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO catalog_pipeline_stages(run_id,stage_key,ordinal,status,executable,safe_arguments,started_at) VALUES($1,'enrich-battlenet-missing',1,'running','catalog-import','{}',now())`, killedRun); err != nil {
		t.Fatal(err)
	}
	killed, err := manager.Start(ctx, killedRun, "wow", "12.1.5.70783", []string{"battlenet"})
	if err != nil {
		t.Fatal(err)
	}
	left, err := store.Begin(ctx, "wow", 70783, "12.1.5.70783", "us", "battlenet", &killed, params)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := runner.ReconcileFailedRun(ctx, killedRun, "wow", true); err != nil || got != 1 {
		t.Fatalf("reconcile killed pipeline=%d %v, want 1", got, err)
	}
	var runStatus, releaseStatus, stageStatus, importStatus string
	if err := pool.QueryRow(ctx, `SELECT run.status,release.status,stage.status,import.status
		FROM catalog_pipeline_runs run JOIN catalog_releases release ON release.pipeline_run_id=run.id
		JOIN catalog_pipeline_stages stage ON stage.run_id=run.id, catalog_import_runs import
		WHERE run.id=$1 AND import.id=$2`, killedRun, left.RunID).Scan(&runStatus, &releaseStatus, &stageStatus, &importStatus); err != nil {
		t.Fatal(err)
	}
	if runStatus != "failed" || releaseStatus != "failed" || stageStatus != "failed" || importStatus != "FAILED" {
		t.Fatalf("killed pipeline left run=%s release=%s stage=%s import=%s", runStatus, releaseStatus, stageStatus, importStatus)
	}
	if err := manager.Resume(ctx, killed, killedRun, "wow", "12.1.5.70783", []string{"battlenet"}); err != nil {
		t.Fatalf("reconciled release cannot be resumed: %v", err)
	}
}

// A new client build normally meets the same build-pinned Battle.net
// namespace as the previous import. Responses preserved by that import, even
// by a release that never published, must complete the new build's records
// without a second request; anything not preserved is still requested.
func TestFreshnessEnrichmentReusesSameNamespaceEvidence(t *testing.T) {
	dsn := os.Getenv("FRESHNESS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("explicit disposable DB required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var mu sync.Mutex
	requests := map[string]int{}
	var server *httptest.Server
	server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"fixture","token_type":"bearer","expires_in":3600}`)
			return
		}
		mu.Lock()
		requests[r.URL.Path+"|"+r.URL.Query().Get("locale")]++
		mu.Unlock()
		link := func(path string) string { return server.URL + path + "?namespace=" + r.URL.Query().Get("namespace") }
		switch r.URL.Path {
		case "/data/wow/item/14":
			fmt.Fprintf(w, `{"_links":{"self":{"href":%q}},"id":14,"name":"Official item 14"}`, link(r.URL.Path))
		case "/data/wow/item/11", "/data/wow/item/13":
			id := strings.TrimPrefix(r.URL.Path, "/data/wow/item/")
			fmt.Fprintf(w, `{"_links":{"self":{"href":%q}},"id":%s,"name":"Official item %s","description":"Official text","media":{"key":{"href":%q},"id":%s}}`,
				link(r.URL.Path), id, id, link("/data/wow/media/item/"+id), id)
		case "/data/wow/media/item/11", "/data/wow/media/item/13":
			fmt.Fprintf(w, `{"_links":{"self":{"href":%q}},"assets":[{"key":"icon","value":"https://render.worldofwarcraft.com/us/icons/56/inv_fixture.jpg","file_data_id":135274}]}`, link(r.URL.Path))
		default:
			w.WriteHeader(404)
			fmt.Fprint(w, `{"code":404}`)
		}
	}))
	defer server.Close()
	client, err := battlenet.New(battlenet.Config{ClientID: "fixture", ClientSecret: "fixture", HTTPClient: server.Client(), TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	manager := catalogrelease.NewManager(pool)
	store := catalogimport.NewStore(pool)
	enrich := func(version string, build int, ids []int64, sourceVersion string, locales ...string) (uuid.UUID, uuid.UUID) {
		t.Helper()
		var runID int64
		if err := pool.QueryRow(ctx, `INSERT INTO catalog_pipeline_runs(pipeline_key,trigger_kind,mode,status,product,publication_environment) VALUES('freshness-reuse-test','manual','apply','failed','wow','staging') RETURNING id`).Scan(&runID); err != nil {
			t.Fatal(err)
		}
		release, err := manager.Start(ctx, runID, "wow", version, []string{"battlenet"})
		if err != nil {
			t.Fatal(err)
		}
		base, err := store.Begin(ctx, "wow", build, version, "us", "wago_tools", &release, map[string]any{"fixture": true})
		if err != nil {
			t.Fatal(err)
		}
		artifact, err := store.RegisterPendingArtifact(ctx, base, "wago_tools", "ItemSparse", "en_US", "https://example.test", map[string]any{})
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			payload := json.RawMessage(fmt.Sprintf(`{"id":%d,"name":"Client item %d"}`, id, id))
			if err := store.UpsertCanonical(ctx, base, catalogimport.Record{Type: "item", ExternalID: id, Locale: "en_US", Payload: payload, SourceURL: "https://example.test", SourceArtifactID: &artifact}); err != nil {
				t.Fatal(err)
			}
			for _, locale := range locales {
				localized := json.RawMessage(fmt.Sprintf(`{"id":%d,"name":"Клиентский предмет %d"}`, id, id))
				if err := store.Enrich(ctx, base, catalogimport.Record{Type: "item", ExternalID: id, Locale: locale, Payload: localized, SourceURL: "https://example.test", SourceArtifactID: &artifact}, "wago_tools"); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := store.UpsertSourceRecord(ctx, artifact, fmt.Sprint(id), payload); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := store.CompleteArtifactFromRecords(ctx, artifact); err != nil {
			t.Fatal(err)
		}
		if err := store.Finish(ctx, base.RunID, "SUCCEEDED", int64(len(ids)), int64(len(ids)), nil); err != nil {
			t.Fatal(err)
		}
		params := map[string]any{"missing_only": true, "resumable_enrichment": "v1", "source_build_version": sourceVersion}
		ic, err := store.Begin(ctx, "wow", build, version, "us", "battlenet", &release, params)
		if err != nil {
			t.Fatal(err)
		}
		opts := options{missingOnly: true, entityTypes: []string{"item"}, locales: append([]string{"en_US"}, locales...), product: "wow",
			sourceBuildVersion: sourceVersion, sourceBuildNumber: 70077, detailWorkers: 1, evidenceReuseMaxAge: time.Hour, localeFollowsCanonical: true}
		var seen, written int64
		if err := importBattleNet(ctx, client, store, ic, opts, &seen, &written); err != nil {
			t.Fatal(err)
		}
		if err := store.Finish(ctx, ic.RunID, "SUCCEEDED", seen, written, nil); err != nil {
			t.Fatal(err)
		}
		var enrichment uuid.UUID
		if err := pool.QueryRow(ctx, `SELECT id FROM catalog_source_artifacts WHERE snapshot_id=$1 AND artifact_key='battlenet-missing/item' AND locale='en_US' AND status='ready' AND content_hash IS NOT NULL`, ic.SnapshotID).Scan(&enrichment); err != nil {
			t.Fatalf("enrichment artifact of %s is not proved: %v", version, err)
		}
		return release, enrichment
	}
	count := func(path string) int {
		mu.Lock()
		defer mu.Unlock()
		if !strings.Contains(path, "|") {
			path += "|en_US"
		}
		return requests[path]
	}

	// The earlier build never publishes, like the release of run 207.
	earlier, earlierArtifact := enrich("12.1.5.70900", 70900, []int64{11, 12}, "12.1.5.70077")
	if err := manager.Fail(ctx, earlier, errors.New("earlier release stopped before publication")); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]int{"/data/wow/item/11": 1, "/data/wow/item/12": 1, "/data/wow/media/item/11": 1} {
		if got := count(path); got != want {
			t.Fatalf("first build requested %s %d times, want %d", path, got, want)
		}
	}

	_, artifact := enrich("12.1.5.70901", 70901, []int64{11, 12, 13}, "12.1.5.70077")
	for path, want := range map[string]int{
		"/data/wow/item/11": 1, "/data/wow/item/12": 1, "/data/wow/media/item/11": 1,
		"/data/wow/item/13": 1, "/data/wow/media/item/13": 1,
	} {
		if got := count(path); got != want {
			t.Fatalf("after the second build %s was requested %d times, want %d", path, got, want)
		}
	}
	rows, err := pool.Query(ctx, `SELECT record_key,COALESCE(payload->>'reused_from_artifact','') FROM catalog_source_records WHERE artifact_id=$1 ORDER BY record_key COLLATE "C"`, artifact)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for rows.Next() {
		var key, origin string
		if err := rows.Scan(&key, &origin); err != nil {
			t.Fatal(err)
		}
		got[key] = origin
	}
	rows.Close()
	want := map[string]string{
		"11": "", "media/11": "", "unavailable/12": "", "13": "", "media/13": "",
		"checkpoint/11": earlierArtifact.String(), "checkpoint/12": earlierArtifact.String(), "checkpoint/13": "",
	}
	if len(got) != len(want) {
		t.Fatalf("second build records: %v", got)
	}
	for key, origin := range want {
		if value, ok := got[key]; !ok || value != origin {
			t.Fatalf("record %s origin %q (present=%t), want %q; all: %v", key, value, ok, origin, got)
		}
	}
	// The reused response must reach the new build's own version and media.
	var name string
	var icons int
	if err := pool.QueryRow(ctx, `
		SELECT localization.name,
			(SELECT count(*) FROM catalog_entity_media media JOIN game_builds b ON b.id=media.build_id
			 WHERE media.entity_id=entity.id AND b.build_number=70901 AND media.media_kind='icon')
		FROM game_entities entity
		JOIN game_entity_versions version ON version.entity_id=entity.id
		JOIN game_builds build ON build.id=version.build_id
		JOIN game_entity_localizations localization ON localization.version_id=version.id AND localization.locale='en_US'
		WHERE entity.entity_type='item' AND entity.external_id=11 AND build.build_number=70901
		ORDER BY version.revision DESC LIMIT 1`).Scan(&name, &icons); err != nil {
		t.Fatal(err)
	}
	if name != "Official item 11" || icons == 0 {
		t.Fatalf("reused evidence not applied to the new build: name=%q icons=%d", name, icons)
	}

	// A second locale asks only where the first locale showed something to ask
	// for: item 11 has an official description; item 12 does not exist in this
	// API build; item 14 exists without a description and already has its name.
	enrich("12.1.5.70903", 70903, []int64{11, 12, 14}, "12.1.5.70077", "ru_RU")
	for path, want := range map[string]int{
		"/data/wow/item/11": 1, "/data/wow/item/12": 1, "/data/wow/item/14": 1,
		"/data/wow/item/11|ru_RU": 1, "/data/wow/item/12|ru_RU": 0, "/data/wow/item/14|ru_RU": 0,
	} {
		if got := count(path); got != want {
			t.Fatalf("after the bilingual build %s was requested %d times, want %d", path, got, want)
		}
	}

	// Another API build is another namespace: nothing preserved may stand in.
	enrich("12.1.5.70902", 70902, []int64{11}, "12.1.5.70078")
	if got := count("/data/wow/item/11"); got != 2 {
		t.Fatalf("a different namespace reused evidence: item 11 requested %d times, want 2", got)
	}
}
