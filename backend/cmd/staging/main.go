// Staging runs the release handlers against an isolated database. Public catalog
// reads are delegated to the published API; no credentials or writes cross over.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/characterworkspace"
	"github.com/Gildra-Foundation/Gildra/backend/internal/gamemeta"
	"github.com/jackc/pgx/v5/pgxpool"
)

func catalogProxy(target *url.URL) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = target.Host
			// An allowlist prevents forwarding sessions, bearer tokens or spoofed
			// identity headers to the published service.
			r.Out.Header = make(http.Header)
			r.Out.Header.Set("Accept", "application/json")
		},
		Transport:      &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 15 * time.Second},
		ModifyResponse: func(r *http.Response) error { r.Header.Del("Set-Cookie"); return nil },
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			http.Error(w, "Catalog temporarily unavailable", http.StatusBadGateway)
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Read-only catalog", http.StatusMethodNotAllowed)
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/v1/game/") && !strings.HasPrefix(r.URL.Path, "/v1/media/") && r.URL.Path != "/v1/library/datasets" {
			http.NotFound(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	})
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	// Fixed origin prevents accidental use of a production database URL.
	if os.Getenv("GILDRA_STAGING") != "1" {
		return errors.New("GILDRA_STAGING=1 required")
	}
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return errors.New("invalid staging database configuration")
	}
	defer db.Close()
	if db.Config().ConnConfig.Host != "postgres-staging" {
		return errors.New("isolated staging database host required")
	}
	if err := db.Ping(ctx); err != nil {
		return errors.New("staging database unavailable")
	}
	mux := http.NewServeMux()
	gamemeta.NewHandler(gamemeta.NewService(db)).Register(mux)
	characterworkspace.NewHandler(characterworkspace.NewService(db), characterworkspace.NewBattleNetVerifier()).Register(mux)
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		check, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if db.Ping(check) != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	origin, _ := url.Parse("https://api.gildra.net")
	mux.Handle("/", catalogProxy(origin))
	server := &http.Server{Addr: ":8080", Handler: http.MaxBytesHandler(mux, 320<<10), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	done := make(chan error, 1)
	go func() { done <- server.ListenAndServe() }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
