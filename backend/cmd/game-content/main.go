// game-content is the isolated stage-one operator tool. It intentionally
// accepts only dedicated loopback test databases, never the production env.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/gamecontent"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: game-content init-schema|import|publish|rollback|serve [options]")
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	file := flags.String("file", "", "seed JSON or stage-one SQL migration")
	release := flags.String("release", "", "prepared release ID")
	generation := flags.Int64("expected-generation", -1, "expected publication generation (0 for initial publication)")
	key := flags.String("request-key", "", "idempotency key")
	actor := flags.String("actor", "", "operator identity")
	reason := flags.String("reason", "", "publication reason")
	public := flags.Bool("public", false, "expose this live release through the public read API")
	addr := flags.String("listen", "127.0.0.1:15474", "local read API address")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if command != "init-schema" && command != "import" && command != "publish" && command != "rollback" && command != "serve" {
		return errors.New("unknown command")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("GAME_CONTENT_DATABASE_URL"))
	if err != nil {
		return errors.New("invalid GAME_CONTENT_DATABASE_URL")
	}
	if os.Getenv("GAME_CONTENT_DATABASE_URL") == "" ||
		(cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "::1") ||
		!strings.HasPrefix(cfg.ConnConfig.Database, "gildra_gc_") {
		return errors.New("stage-one CLI requires a dedicated loopback gildra_gc_* database in GAME_CONTENT_DATABASE_URL")
	}
	cfg.MaxConns = 4
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return errors.New("database connection failed")
	}
	defer db.Close()
	store := gamecontent.NewStore(db)
	output := json.NewEncoder(os.Stdout)
	switch command {
	case "init-schema":
		raw, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		parts := strings.Split(string(raw), "-- +goose Down")
		if len(parts) != 2 || !strings.Contains(parts[0], "CREATE TABLE gc_contexts") || !strings.Contains(parts[0], "CREATE TABLE gc_outbox") {
			return errors.New("expected stage-one gc_* migration")
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
		return output.Encode(map[string]string{"status": "schema_created"})
	case "import":
		f, err := os.Open(*file)
		if err != nil {
			return err
		}
		defer f.Close()
		seed, err := gamecontent.DecodeSeed(f)
		if err != nil {
			return err
		}
		result, err := store.Prepare(ctx, seed)
		if err != nil {
			return err
		}
		return output.Encode(result)
	case "publish", "rollback":
		result, err := store.Publish(ctx, gamecontent.PublishRequest{ReleaseID: *release, ExpectedGeneration: *generation, RequestKey: *key, Actor: *actor, Reason: *reason, Public: *public, Kind: command})
		if err != nil {
			return err
		}
		return output.Encode(result)
	case "serve":
		host, _, err := net.SplitHostPort(*addr)
		if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
			return errors.New("stage-one API must bind to loopback")
		}
		mux := http.NewServeMux()
		gamecontent.NewHandler(store).Register(mux)
		mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
			if db.Ping(r.Context()) != nil {
				http.Error(w, "unavailable", 503)
				return
			}
			w.WriteHeader(200)
		})
		server := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
		go func() {
			<-ctx.Done()
			shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdown)
		}()
		err = server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
	return nil
}
