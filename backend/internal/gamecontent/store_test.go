package gamecontent

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

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func exampleSeed(edition string, timer int) Seed {
	payload := fmt.Sprintf(`{"edition":%q,"catalog":{"dungeonOrder":["test-dungeon"],"season":{"slug":"test-season","names":{"en":"Test season","ru":"Тестовый сезон"}}},"dungeons":{"test-dungeon":{"slug":"test-dungeon","name":"Test dungeon","nameRu":"Тестовое подземелье","timerSeconds":%d,"bossCount":1}},"combatIntel":{"test-dungeon":{}},"verification":{}}`, edition, timer)
	return Seed{SchemaVersion: 1, Context: Context{Game: "wow", Edition: edition, Channel: "live", Region: "global", ProgressionKind: "none"}, Modules: []Module{{ModuleID: "mythic-plus", SchemaVersion: 1, Payload: json.RawMessage(payload)}}}
}

func TestSeedBoundaries(t *testing.T) {
	valid := exampleSeed("retail", 1800)
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name string
		seed Seed
	}{
		{"invalid timer", exampleSeed("retail", 0)},
		{"missing combat projection", func() Seed {
			s := exampleSeed("retail", 1800)
			s.Modules[0].Payload = json.RawMessage(strings.Replace(string(s.Modules[0].Payload), `"combatIntel":{"test-dungeon":{}}`, `"combatIntel":{}`, 1))
			return s
		}()},
		{"wrong edition", func() Seed { s := exampleSeed("retail", 1800); s.Context.Edition = "forever"; return s }()},
		{"empty", Seed{SchemaVersion: 1, Context: valid.Context}},
		{"duplicate", func() Seed { s := exampleSeed("retail", 1800); s.Modules = append(s.Modules, s.Modules[0]); return s }()},
	} {
		t.Run(test.name, func(t *testing.T) {
			if !errors.Is(test.seed.Validate(), ErrInvalid) {
				t.Fatal("expected invalid seed")
			}
		})
	}
	for _, raw := range []string{`{}`, `{"schemaVersion":1,"unknown":true}`, `{} {}`} {
		if _, err := DecodeSeed(strings.NewReader(raw)); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted %s", raw)
		}
	}
	first, _, _ := releaseHash(valid.Modules)
	valid.Modules[0].Payload = json.RawMessage(`{"verification":{},"combatIntel":{"test-dungeon":{}},"dungeons":{"test-dungeon":{"bossCount":1,"timerSeconds":1800,"nameRu":"Тестовое подземелье","name":"Test dungeon","slug":"test-dungeon"}},"catalog":{"dungeonOrder":["test-dungeon"],"season":{"names":{"ru":"Тестовый сезон","en":"Test season"},"slug":"test-season"}},"edition":"retail"}`)
	second, _, _ := releaseHash(valid.Modules)
	if first != second {
		t.Fatal("JSON property order changed semantic hash")
	}
}

func testStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("GAME_CONTENT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set dedicated GAME_CONTENT_TEST_DATABASE_URL for PostgreSQL integration")
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal("invalid test database configuration")
	}
	if !strings.HasPrefix(cfg.ConnConfig.Database, "gildra_gc_") || (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") {
		t.Fatal("integration tests require a dedicated loopback gildra_gc_* database")
	}
	admin, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	schema := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = admin.Exec(t.Context(), `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = admin.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)
		admin.Close()
	})
	raw, err := os.ReadFile(filepath.Join("..", "..", "migrations", "postgres", "00173_game_content_releases.sql"))
	if err != nil {
		t.Fatal(err)
	}
	up := strings.Split(string(raw), "-- +goose Down")[0]
	if _, err = db.Exec(t.Context(), up); err != nil {
		t.Fatal(err)
	}
	return NewStore(db), db
}

func publishReq(release string, generation int64, key string) PublishRequest {
	return PublishRequest{ReleaseID: release, ExpectedGeneration: generation, RequestKey: key, Actor: "integration-test", Reason: "synthetic isolated fixture", Public: true, Kind: "publish"}
}

func TestReleasePublicationAndRollback(t *testing.T) {
	s, db := testStore(t)
	ctx := t.Context()
	seed := exampleSeed("retail", 1800)
	first, err := s.Prepare(ctx, seed)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.Prepare(ctx, seed)
	if err != nil || again.ReleaseID != first.ReleaseID {
		t.Fatalf("prepare idempotency: %v", err)
	}
	if _, err = s.Catalog(ctx, seed.Context); !errors.Is(err, ErrNotFound) {
		t.Fatalf("draft catalog exposed: %v", err)
	}
	if _, err = s.Snapshot(ctx, first.ReleaseID, "mythic-plus"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("draft ID exposed: %v", err)
	}
	req := publishReq(first.ReleaseID, 0, "first")
	pub, err := s.Publish(ctx, req)
	if err != nil || pub.Generation != 1 {
		t.Fatalf("first publish: %v", err)
	}
	replay, err := s.Publish(ctx, req)
	if err != nil || replay != pub {
		t.Fatalf("publish replay: %v", err)
	}
	req.Reason = "different request under same key"
	if _, err = s.Publish(ctx, req); !errors.Is(err, ErrConflict) {
		t.Fatalf("request collision: %v", err)
	}
	second, err := s.Prepare(ctx, exampleSeed("retail", 1860))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(ctx, publishReq(second.ReleaseID, 0, "stale")); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale generation: %v", err)
	}
	if _, err = s.Publish(ctx, publishReq(second.ReleaseID, 1, "second")); err != nil {
		t.Fatal(err)
	}
	old, err := s.Snapshot(ctx, first.ReleaseID, "mythic-plus")
	if err != nil || !strings.Contains(string(old.Payload), "1800") {
		t.Fatalf("immutable old snapshot: %v", err)
	}
	rollback := publishReq(first.ReleaseID, 2, "rollback")
	rollback.Kind = "rollback"
	if p, err := s.Publish(ctx, rollback); err != nil || p.Generation != 3 {
		t.Fatalf("rollback: %v", err)
	}
	if _, err = s.Publish(ctx, publishReq(second.ReleaseID, 2, "old-worker")); !errors.Is(err, ErrConflict) {
		t.Fatalf("old worker overwrote rollback: %v", err)
	}
	catalog, err := s.Catalog(ctx, seed.Context)
	if err != nil || catalog.ReleaseID != first.ReleaseID || catalog.Generation != 3 {
		t.Fatalf("catalog: %+v %v", catalog, err)
	}
	var events, outbox int
	if err = db.QueryRow(ctx, `SELECT (SELECT count(*) FROM gc_publication_events),(SELECT count(*) FROM gc_outbox WHERE delivered_at IS NULL)`).Scan(&events, &outbox); err != nil || events != 3 || outbox != 3 {
		t.Fatalf("atomic events/outbox: %d %d %v", events, outbox, err)
	}
	if _, err = db.Exec(ctx, `UPDATE gc_module_snapshots SET payload='{}'`); err == nil {
		t.Fatal("snapshot mutation allowed")
	}
	if _, err = db.Exec(ctx, `DELETE FROM gc_publication_events`); err == nil {
		t.Fatal("audit deletion allowed")
	}
	invalid := exampleSeed("retail", -1)
	if _, err = s.Prepare(ctx, invalid); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid prepare: %v", err)
	}
	after, _ := s.Catalog(ctx, seed.Context)
	if after.Generation != 3 {
		t.Fatal("invalid seed changed publication")
	}
}

func TestConcurrentPublishOnlyOneWinner(t *testing.T) {
	s, db := testStore(t)
	ctx := t.Context()
	a, err := s.Prepare(ctx, exampleSeed("retail", 1800))
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Prepare(ctx, exampleSeed("retail", 1900))
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i, id := range []string{a.ReleaseID, b.ReleaseID} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Publish(ctx, publishReq(id, 0, fmt.Sprintf("race-%d", i)))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	wins, conflicts := 0, 0
	for err := range errs {
		if err == nil {
			wins++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("wins=%d conflicts=%d", wins, conflicts)
	}
	var count int
	if err = db.QueryRow(ctx, `SELECT count(*) FROM gc_outbox`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("partial publication: %d %v", count, err)
	}
}

func TestContextIsolationAndPrivateVisibility(t *testing.T) {
	s, db := testStore(t)
	ctx := t.Context()
	retailSeed, foreverSeed := exampleSeed("retail", 1800), exampleSeed("forever", 2400)
	retail, err := s.Prepare(ctx, retailSeed)
	if err != nil {
		t.Fatal(err)
	}
	forever, err := s.Prepare(ctx, foreverSeed)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range []Release{retail, forever} {
		if _, err = s.Publish(ctx, publishReq(r.ReleaseID, 0, "initial")); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.Catalog(ctx, foreverSeed.Context)
	if err != nil || got.ReleaseID != forever.ReleaseID {
		t.Fatalf("edition leaked: %+v %v", got, err)
	}
	_, err = db.Exec(ctx, `INSERT INTO gc_release_modules(release_id,context_id,module_id,snapshot_id)
		SELECT $1,context_id,'dungeons',$2 FROM gc_releases WHERE id=$1`, retail.ReleaseID, forever.Modules["mythic-plus"])
	if err == nil {
		t.Fatal("cross-context snapshot reference allowed")
	}
	betaSeed := exampleSeed("forever", 2500)
	betaSeed.Context.Channel = "beta"
	beta, err := s.Prepare(ctx, betaSeed)
	if err != nil {
		t.Fatal(err)
	}
	req := publishReq(beta.ReleaseID, 0, "beta")
	if _, err = s.Publish(ctx, req); !errors.Is(err, ErrInvalid) {
		t.Fatalf("public beta allowed: %v", err)
	}
	req.Public = false
	if _, err = s.Publish(ctx, req); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Snapshot(ctx, beta.ReleaseID, "mythic-plus"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("private snapshot exposed: %v", err)
	}
	if _, err = s.Catalog(ctx, betaSeed.Context); !errors.Is(err, ErrNotFound) {
		t.Fatalf("private catalog exposed: %v", err)
	}
	never, err := s.Prepare(ctx, exampleSeed("retail", 2100))
	if err != nil {
		t.Fatal(err)
	}
	req = publishReq(never.ReleaseID, 1, "unpublished-rollback")
	req.Kind = "rollback"
	if _, err = s.Publish(ctx, req); !errors.Is(err, ErrInvalid) {
		t.Fatalf("rollback to draft allowed: %v", err)
	}
}

func TestModuleUpdateKeepsUnchangedSnapshotAndRejectsOmission(t *testing.T) {
	s, _ := testStore(t)
	ctx := t.Context()
	seed := exampleSeed("retail", 1800)
	seed.Modules = append(seed.Modules, Module{ModuleID: "raids", SchemaVersion: 1, Payload: json.RawMessage(`{"edition":"retail","catalog":{"season":{"slug":"test-season","names":{"en":"Test season","ru":"Тестовый сезон"}},"currentRaidSlug":"fixture-raid","entries":[{"slug":"fixture-raid","names":{"en":"Fixture","ru":"Тест"},"bosses":[{"slug":"fixture-boss"}]}]},"legacyRaids":{},"manifest":{},"strategies":{},"venomousIntel":{},"venomousBosses":[],"difficulties":[],"reviews":[],"spellIdentities":[]}`)})
	first, err := s.Prepare(ctx, seed)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(ctx, publishReq(first.ReleaseID, 0, "both")); err != nil {
		t.Fatal(err)
	}
	seed.Modules[0] = exampleSeed("retail", 1900).Modules[0]
	second, err := s.Prepare(ctx, seed)
	if err != nil {
		t.Fatal(err)
	}
	if first.Modules["raids"] != second.Modules["raids"] || first.Modules["mythic-plus"] == second.Modules["mythic-plus"] {
		t.Fatal("unchanged module was not reused")
	}
	if _, err = s.Publish(ctx, publishReq(second.ReleaseID, 1, "timer")); err != nil {
		t.Fatal(err)
	}
	partial, err := s.Prepare(ctx, exampleSeed("retail", 2000))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(ctx, publishReq(partial.ReleaseID, 2, "omitted")); !errors.Is(err, ErrInvalid) {
		t.Fatalf("module omission allowed: %v", err)
	}
	current, err := s.Catalog(ctx, seed.Context)
	if err != nil || current.ReleaseID != second.ReleaseID {
		t.Fatalf("failed publication changed pointer: %v", err)
	}
}

func TestSchemaDownAndReapplyInIsolatedSchema(t *testing.T) {
	_, db := testStore(t)
	raw, err := os.ReadFile(filepath.Join("..", "..", "migrations", "postgres", "00173_game_content_releases.sql"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(string(raw), "-- +goose Down")
	if _, err = db.Exec(t.Context(), parts[1]); err != nil {
		t.Fatalf("down migration: %v", err)
	}
	// Exercise the actual deployment parser, including the PL/pgSQL function
	// delimiters, against this test's isolated schema only.
	sqlDB := stdlib.OpenDB(*db.Config().ConnConfig)
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, fstest.MapFS{
		"00173_game_content_releases.sql": &fstest.MapFile{Data: raw},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = provider.Up(t.Context()); err != nil {
		t.Fatalf("goose up migration: %v", err)
	}
	if _, err = provider.Down(t.Context()); err != nil {
		t.Fatalf("goose down migration: %v", err)
	}
	var missing bool
	if err = db.QueryRow(t.Context(), `SELECT to_regclass('gc_contexts') IS NULL`).Scan(&missing); err != nil || !missing {
		t.Fatalf("schema not removed: %v", err)
	}
	if _, err = provider.Up(t.Context()); err != nil {
		t.Fatalf("reapply migration: %v", err)
	}
	if version, err := provider.GetDBVersion(t.Context()); err != nil || version != 173 {
		t.Fatalf("unexpected goose version %d: %v", version, err)
	}
}
