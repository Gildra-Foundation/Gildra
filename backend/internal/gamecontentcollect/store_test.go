package gamecontentcollect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/gamecontent"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

func testStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	value := os.Getenv("GAME_CONTENT_TEST_DATABASE_URL")
	if value == "" {
		t.Skip("dedicated GAME_CONTENT_TEST_DATABASE_URL required")
	}
	cfg, err := pgxpool.ParseConfig(value)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(cfg.ConnConfig.Database, "gildra_gc_") || (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") {
		t.Fatal("requires dedicated local gildra_gc_* test database")
	}
	admin, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	schema := "test_gc_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = admin.Exec(t.Context(), `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.MaxConns = 8
	db, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = admin.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)
		admin.Close()
	})
	files := fstest.MapFS{}
	for _, name := range []string{"00173_game_content_releases.sql", "00174_game_content_collection.sql"} {
		raw, err := os.ReadFile(filepath.Join("..", "..", "migrations", "postgres", name))
		if err != nil {
			t.Fatal(err)
		}
		files[name] = &fstest.MapFile{Data: raw}
	}
	sqlDB := stdlib.OpenDB(*cfg.ConnConfig)
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, files)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = provider.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	s := NewStore(db)
	if err = s.Configure(t.Context()); err != nil {
		t.Fatal(err)
	}
	return s, db
}

type stubSource struct {
	mu          sync.Mutex
	calls       int
	body        map[string][]byte
	failure     *Failure
	entered     chan struct{}
	resume      chan struct{}
	conditional bool
}

func (s *stubSource) Fetch(ctx context.Context, target Target, previous *CachedArtifact) (FetchResult, error) {
	s.mu.Lock()
	s.calls++
	failure := s.failure
	raw := s.body[target.ModuleID]
	s.mu.Unlock()
	if s.entered != nil {
		close(s.entered)
		select {
		case <-s.resume:
		case <-ctx.Done():
			return FetchResult{}, ctx.Err()
		}
	}
	if failure != nil {
		return FetchResult{}, failure
	}
	if s.conditional && previous != nil {
		return FetchResult{Body: previous.Body, Status: 304, ETag: `"fixture"`}, nil
	}
	return FetchResult{Body: raw, Status: 200, ETag: `"fixture"`}, nil
}
func newStub(t *testing.T) *stubSource {
	return &stubSource{body: map[string][]byte{"raids": fixture(t, "raids"), "mythic-plus": fixture(t, "mythic-plus")}}
}
func count(t *testing.T, db *pgxpool.Pool, table string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(t.Context(), `SELECT count(*) FROM `+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func publicFingerprint(t *testing.T, db *pgxpool.Pool) map[string]string {
	t.Helper()
	result := map[string]string{}
	for _, table := range []string{"gc_contexts", "gc_module_snapshots", "gc_releases", "gc_release_modules", "gc_publication_channels", "gc_publication_events", "gc_outbox"} {
		var value string
		if err := db.QueryRow(t.Context(), `SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'')) FROM `+table+` r`).Scan(&value); err != nil {
			t.Fatal(err)
		}
		result[table] = value
	}
	return result
}
func publishBaseline(t *testing.T, db *pgxpool.Pool) {
	t.Helper()
	s := gamecontent.NewStore(db)
	payload := json.RawMessage(`{"edition":"retail","catalog":{"season":{"slug":"fixture","names":{"en":"Fixture","ru":"Тест"}},"dungeonOrder":["fixture"]},"dungeons":{"fixture":{"slug":"fixture","name":"Fixture","nameRu":"Тест","timerSeconds":1800,"bossCount":1}},"combatIntel":{"fixture":{}},"verification":{}}`)
	r, err := s.Prepare(t.Context(), gamecontent.Seed{SchemaVersion: 1, Context: Targets()[0].Context, Modules: []gamecontent.Module{{ModuleID: "mythic-plus", SchemaVersion: 1, Payload: payload}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(t.Context(), gamecontent.PublishRequest{ReleaseID: r.ReleaseID, ExpectedGeneration: 0, RequestKey: "baseline", Actor: "test", Reason: "isolated baseline", Public: true, Kind: "publish"}); err != nil {
		t.Fatal(err)
	}
}

func TestThreeFullRunsPerModuleDoNotPublishAndReuseArtifacts(t *testing.T) {
	s, db := testStore(t)
	publishBaseline(t, db)
	before := publicFingerprint(t, db)
	source := newStub(t)
	source.conditional = true
	c := NewCollector(s, source)
	for _, target := range Targets() {
		for i := range 3 {
			key := fmt.Sprintf("run-%d", i)
			r, err := c.Collect(t.Context(), target, key, time.Now())
			if err != nil {
				t.Fatal(err)
			}
			want := "no_change"
			if i == 0 {
				want = "candidate_ready"
			}
			if r.Status != want || r.BaseGeneration != 1 {
				t.Fatal(r)
			}
			if _, err = c.Collect(t.Context(), target, key, time.Now()); err != nil {
				t.Fatal(err)
			}
		}
	}
	if source.calls != 6 || count(t, db, "gc_source_artifacts") != 2 || count(t, db, "gc_collection_observations") != 6 || count(t, db, "gc_collection_candidates") != 2 {
		t.Fatal("non-idempotent collection")
	}
	if string(canonical(before)) != string(canonical(publicFingerprint(t, db))) {
		t.Fatal("collection mutated publication state")
	}
	var states []string
	rows, err := db.Query(t.Context(), `SELECT status FROM gc_collection_candidates`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var state string
		_ = rows.Scan(&state)
		states = append(states, state)
	}
	if len(states) != 2 || states[0] != "pending_review" || states[1] != "pending_review" {
		t.Fatal("candidate approved automatically")
	}
}

func TestChangesAndSourceFailuresPreservePriorCandidates(t *testing.T) {
	s, db := testStore(t)
	source := newStub(t)
	c := NewCollector(s, source)
	target := Targets()[1]
	first, err := c.Collect(t.Context(), target, "initial", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	source.body["mythic-plus"] = []byte(strings.Replace(string(source.body["mythic-plus"]), `"keystone_timer_seconds":1680`, `"keystone_timer_seconds":1710`, 1))
	r, err := c.Collect(t.Context(), target, "changed", time.Now())
	if err != nil || r.Status != "candidate_ready" {
		t.Fatal(r, err)
	}
	raw, err := s.Inspect(t.Context(), r.ID)
	if err != nil || !strings.Contains(string(raw), "/dungeons/14063/timerSeconds") {
		t.Fatal(string(raw), err)
	}
	var diff Diff
	if err = db.QueryRow(t.Context(), `SELECT diff FROM gc_collection_candidates WHERE run_id=$1`, r.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(raw, &diff)
	if diff.Total != 1 {
		t.Fatal("metadata noise in semantic diff", diff)
	}
	source.failure = &Failure{Code: "source_http_429", Retryable: true, RetryAfter: 2 * time.Hour}
	failed, err := c.Collect(t.Context(), target, "retry", time.Now())
	if err == nil || !failed.Retryable || failed.Status != "failed" {
		t.Fatal(failed, err)
	}
	source.failure = nil
	if _, err = c.Collect(t.Context(), Targets()[0], "provider-cooldown", time.Now()); err == nil {
		t.Fatal("other module bypassed provider Retry-After")
	}
	if _, err = db.Exec(t.Context(), `UPDATE gc_source_cooldowns SET not_before=now()-interval '1 second'`); err != nil {
		t.Fatal(err)
	}
	r, err = c.Collect(t.Context(), target, "retry", time.Now())
	if err != nil || r.Status != "no_change" || r.Attempt != 2 {
		t.Fatal(r, err)
	}
	source.body["mythic-plus"] = []byte(`{"seasons":[]}`)
	r, err = c.Collect(t.Context(), target, "partial", time.Now())
	if err == nil || r.Retryable || r.Status != "failed" {
		t.Fatal(r, err)
	}
	if count(t, db, "gc_collection_candidates") != 2 {
		t.Fatal("invalid source replaced candidate")
	}
	var original string
	if err = db.QueryRow(t.Context(), `SELECT facts_hash FROM gc_collection_candidates WHERE run_id=$1`, first.ID).Scan(&original); err != nil || original != *first.FactsHash {
		t.Fatal("old candidate mutated")
	}
	// Returning to earlier source content needs a new diff against the last
	// successful content, rather than reusing an obsolete historical diff.
	source.body["mythic-plus"] = fixture(t, "mythic-plus")
	r, err = c.Collect(t.Context(), target, "returned", time.Now())
	if err != nil || r.Status != "candidate_ready" || count(t, db, "gc_collection_candidates") != 3 {
		t.Fatal(r, err)
	}
}

func TestOneActiveRunAndRecoveryFences(t *testing.T) {
	s, _ := testStore(t)
	source := newStub(t)
	source.entered = make(chan struct{})
	source.resume = make(chan struct{})
	c := NewCollector(s, source)
	target := Targets()[0]
	done := make(chan error, 1)
	go func() { _, err := c.Collect(t.Context(), target, "concurrent", time.Now()); done <- err }()
	select {
	case <-source.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("fetch not started")
	}
	if _, err := c.Collect(t.Context(), target, "other", time.Now()); !errors.Is(err, ErrBusy) {
		t.Fatal("concurrent run acquired target", err)
	}
	close(source.resume)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	l, err := s.acquire(t.Context(), target, "crashed", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	firstFence := l.run.Fence
	if err = l.record(t.Context(), FetchResult{Body: fixture(t, "raids"), Status: 200}); err != nil {
		t.Fatal(err)
	}
	l.close()
	clean := newStub(t)
	clean.conditional = true
	r, err := NewCollector(s, clean).Collect(t.Context(), target, "crashed", time.Now())
	if err != nil || r.Fence <= firstFence || r.Attempt != 2 || r.Status != "no_change" {
		t.Fatal("abandoned attempt was not safely resumed", r, err)
	}
}

func TestCandidateCommitFailureAndImmutableEvidence(t *testing.T) {
	s, db := testStore(t)
	source := newStub(t)
	c := NewCollector(s, source)
	target := Targets()[0]
	_, err := db.Exec(t.Context(), `CREATE FUNCTION reject_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER injected BEFORE INSERT ON gc_collection_candidates FOR EACH ROW EXECUTE FUNCTION reject_candidate()`)
	if err != nil {
		t.Fatal(err)
	}
	r, err := c.Collect(t.Context(), target, "atomic", time.Now())
	if err == nil || r.Status != "failed" || count(t, db, "gc_collection_candidates") != 0 {
		t.Fatal("partial candidate commit", r, err)
	}
	if _, err = db.Exec(t.Context(), `DROP TRIGGER injected ON gc_collection_candidates`); err != nil {
		t.Fatal(err)
	}
	r, err = c.Collect(t.Context(), target, "atomic", time.Now())
	if err != nil || r.Attempt != 2 || r.Status != "candidate_ready" {
		t.Fatal(r, err)
	}
	for _, query := range []string{`UPDATE gc_source_artifacts SET source_url='changed'`, `DELETE FROM gc_collection_candidates`} {
		if _, err = db.Exec(t.Context(), query); err == nil {
			t.Fatal("immutable evidence changed")
		}
	}
	// The schema itself cannot be configured for automatic publication.
	if _, err = db.Exec(t.Context(), `UPDATE gc_collection_targets SET mode='auto_publish'`); err == nil {
		t.Fatal("auto publish mode accepted")
	}
}

func TestRiverDailyStartupDeduplicationAndManualQueue(t *testing.T) {
	s, db := testStore(t)
	m, err := rivermigrate.New(riverpgxv5.New(db), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.Migrate(t.Context(), rivermigrate.DirectionUp, nil); err != nil {
		t.Fatal(err)
	}
	source := newStub(t)
	c := NewCollector(s, source)
	workers := river.NewWorkers()
	worker := NewWorker(c)
	worker.now = func() time.Time { return time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC) }
	river.AddWorker(workers, worker)
	jobs := PeriodicJobs(func() time.Time { return time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC) })
	client, err := river.NewClient(riverpgxv5.New(db), &river.Config{Workers: workers, Queues: map[string]river.QueueConfig{QueueName: {MaxWorkers: 1}}, PeriodicJobs: jobs})
	if err != nil {
		t.Fatal(err)
	}
	events, unsubscribe := client.Subscribe(river.EventKindJobCompleted)
	defer unsubscribe()
	if err = client.Start(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = client.Stop(ctx)
	})
	for range 2 {
		select {
		case <-events:
		case <-time.After(10 * time.Second):
			t.Fatal("daily startup job did not complete")
		}
	}
	args := CollectArgs{TargetKey: Targets()[0].Key(), RunKey: "manual/queue-test", ScheduledFor: time.Now().UTC().Format(time.RFC3339)}
	first, err := client.Insert(t.Context(), args, InsertOptions())
	if err != nil {
		t.Fatal(err)
	}
	second, err := client.Insert(t.Context(), args, InsertOptions())
	if err != nil || second.Job.ID != first.Job.ID || !second.UniqueSkippedAsDuplicate {
		t.Fatal("River duplicate inserted", err)
	}
	select {
	case <-events:
	case <-time.After(10 * time.Second):
		t.Fatal("manual queue job did not complete")
	}
	if count(t, db, "gc_collection_runs") != 3 || count(t, db, "gc_collection_candidates") != 2 {
		t.Fatal("wrong daily/manual results")
	}
	if err = client.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	// Re-inserting a startup slot after restart must not fetch it again, even
	// if River's completed-job retention later removes its own uniqueness row.
	for _, target := range Targets() {
		args := JobArgs(target, time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC))
		r, err := c.Collect(t.Context(), target, args.RunKey, time.Now())
		if err != nil || r.Attempt != 1 {
			t.Fatal(r, err)
		}
	}
	source.mu.Lock()
	calls := source.calls
	source.mu.Unlock()
	if calls != 3 {
		t.Fatal("startup replay fetched source again", calls)
	}
}

func TestWorkerHonorsRetryAfterAndAttemptBudget(t *testing.T) {
	s, _ := testStore(t)
	source := newStub(t)
	source.failure = &Failure{Code: "source_http_429", Retryable: true, RetryAfter: 2 * time.Hour}
	w := NewWorker(NewCollector(s, source))
	args := CollectArgs{TargetKey: Targets()[0].Key(), RunKey: "budget", ScheduledFor: time.Now().UTC().Format(time.RFC3339)}
	for i := range 4 {
		err := w.Work(t.Context(), &river.Job[CollectArgs]{Args: args})
		if err == nil {
			t.Fatal("429 treated as success")
		}
		if i < 3 {
			var snooze *river.JobSnoozeError
			if !errors.As(err, &snooze) || snooze.Duration < 119*time.Minute || snooze.Duration > 2*time.Hour {
				t.Fatal("Retry-After not respected", err)
			}
		} else {
			var cancelled *river.JobCancelError
			if !errors.As(err, &cancelled) {
				t.Fatal("snoozes bypassed attempt budget", err)
			}
		}
	}
}

func TestCollectionWithoutPublicationWritePrivileges(t *testing.T) {
	_, db := testStore(t)
	publishBaseline(t, db)
	before := publicFingerprint(t, db)
	role := "gc_reader_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	schema := db.Config().ConnConfig.RuntimeParams["search_path"]
	for _, sql := range []string{`CREATE ROLE ` + role, `GRANT USAGE ON SCHEMA ` + schema + ` TO ` + role,
		`GRANT SELECT ON gc_contexts,gc_publication_channels TO ` + role,
		`GRANT ALL ON gc_collection_targets,gc_collection_runs,gc_collection_candidates,gc_source_artifacts,gc_collection_observations,gc_source_cooldowns TO ` + role} {
		if _, err := db.Exec(t.Context(), sql); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = db.Exec(context.Background(), `DROP OWNED BY `+role)
		_, _ = db.Exec(context.Background(), `DROP ROLE `+role)
	})
	cfg := db.Config()
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, `SET ROLE `+role)
		return err
	}
	restricted, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer restricted.Close()
	if _, err = restricted.Exec(t.Context(), `UPDATE gc_publication_channels SET generation=generation+1`); err == nil {
		t.Fatal("collector role could publish")
	}
	c := NewCollector(NewStore(restricted), newStub(t))
	for _, target := range Targets() {
		r, err := c.Collect(t.Context(), target, "restricted", time.Now())
		if err != nil || r.Status != "candidate_ready" {
			t.Fatal(r, err)
		}
	}
	if string(canonical(before)) != string(canonical(publicFingerprint(t, db))) {
		t.Fatal("publication state changed")
	}
}

func TestCollectionMigrationDownAndReapplyPreservesPublication(t *testing.T) {
	_, db := testStore(t)
	publishBaseline(t, db)
	before := publicFingerprint(t, db)
	files := fstest.MapFS{}
	for _, name := range []string{"00173_game_content_releases.sql", "00174_game_content_collection.sql"} {
		raw, err := os.ReadFile(filepath.Join("..", "..", "migrations", "postgres", name))
		if err != nil {
			t.Fatal(err)
		}
		files[name] = &fstest.MapFile{Data: raw}
	}
	sqlDB := stdlib.OpenDB(*db.Config().ConnConfig)
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, files)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = provider.Down(t.Context()); err != nil {
		t.Fatal(err)
	}
	if string(canonical(before)) != string(canonical(publicFingerprint(t, db))) {
		t.Fatal("collection migration removed public data")
	}
	if _, err = provider.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	version, err := provider.GetDBVersion(t.Context())
	if err != nil || version != 174 {
		t.Fatal(version, err)
	}
}
