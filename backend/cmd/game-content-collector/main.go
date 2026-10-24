// Local operator entrypoint for collect_only. This executable has no public
// publisher dependency or option to approve a candidate.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	collect "github.com/Gildra-Foundation/Gildra/backend/internal/gamecontentcollect"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: game-content-collector init-schema|configure|init-queue|run|enqueue|worker|runs|inspect [options]")
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	module := flags.String("module", "", "raids or mythic-plus")
	key := flags.String("request-key", "", "manual idempotency key, required for run/enqueue")
	id := flags.String("run", "", "run UUID to inspect")
	file := flags.String("file", "", "stage-two SQL migration for isolated local database")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if !map[string]bool{"init-schema": true, "configure": true, "init-queue": true, "run": true, "enqueue": true, "worker": true, "runs": true, "inspect": true}[command] {
		return errors.New("unknown collect_only command")
	}
	value := os.Getenv("GAME_CONTENT_DATABASE_URL")
	cfg, err := pgxpool.ParseConfig(value)
	if err != nil || value == "" || !strings.HasPrefix(cfg.ConnConfig.Database, "gildra_gc_") || (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "::1") {
		return errors.New("collector CLI requires dedicated loopback gildra_gc_* database in GAME_CONTENT_DATABASE_URL")
	}
	cfg.MaxConns = 8
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return errors.New("collector database unavailable")
	}
	defer db.Close()
	store := collect.NewStore(db)
	source := collect.NewHTTPSource()
	collector := collect.NewCollector(store, source)
	out := json.NewEncoder(os.Stdout)
	if command == "init-schema" {
		raw, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		parts := strings.Split(string(raw), "-- +goose Down")
		if len(parts) != 2 || !strings.Contains(parts[0], "CREATE TABLE gc_collection_targets") || !strings.Contains(parts[0], "CREATE TABLE gc_source_cooldowns") {
			return errors.New("expected stage-two collection migration")
		}
		tx, err := db.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		if _, err = tx.Exec(ctx, parts[0]); err != nil {
			return err
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
		return out.Encode(map[string]string{"status": "collection_schema_created"})
	}
	if command == "configure" {
		if err = store.Configure(ctx); err != nil {
			return err
		}
		return out.Encode(map[string]any{"mode": "collect_only", "targets": collect.Targets(), "schedulesUTC": []string{"raids 03:15 daily", "mythic-plus 03:30 daily"}})
	}
	if command == "init-queue" {
		m, err := rivermigrate.New(riverpgxv5.New(db), nil)
		if err != nil {
			return err
		}
		_, err = m.Migrate(ctx, rivermigrate.DirectionUp, nil)
		return err
	}
	if command == "runs" {
		r, err := store.Runs(ctx)
		if err != nil {
			return err
		}
		return out.Encode(r)
	}
	if command == "inspect" {
		r, err := store.Inspect(ctx, *id)
		if err != nil {
			return err
		}
		return out.Encode(r)
	}
	workers := river.NewWorkers()
	river.AddWorker(workers, collect.NewWorker(collector))
	client, err := river.NewClient(riverpgxv5.New(db), &river.Config{Workers: workers, Queues: map[string]river.QueueConfig{collect.QueueName: {MaxWorkers: 1}}, PeriodicJobs: collect.PeriodicJobs(time.Now)})
	if err != nil {
		return err
	}
	if command == "worker" {
		if err = client.Start(ctx); err != nil {
			return err
		}
		<-ctx.Done()
		stop, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		return client.Stop(stop)
	}
	var target *collect.Target
	for _, t := range collect.Targets() {
		if t.ModuleID == *module {
			v := t
			target = &v
		}
	}
	if target == nil || strings.TrimSpace(*key) == "" || len(*key) > 180 {
		return errors.New("run/enqueue requires supported --module and --request-key (1..180 chars)")
	}
	when := time.Now().UTC()
	runKey := "manual/" + *key
	if command == "enqueue" {
		r, err := client.Insert(ctx, collect.CollectArgs{TargetKey: target.Key(), RunKey: runKey, ScheduledFor: when.Format(time.RFC3339)}, collect.InsertOptions())
		if err != nil {
			return err
		}
		return out.Encode(map[string]any{"jobId": r.Job.ID, "duplicate": r.UniqueSkippedAsDuplicate, "mode": "collect_only"})
	}
	r, err := collector.Collect(ctx, *target, runKey, when)
	if writeErr := out.Encode(r); writeErr != nil {
		return writeErr
	}
	return err
}
