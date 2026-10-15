// auction-live-probe exposes only catalog reads on loopback for live QA.
// Every PostgreSQL connection is forced read-only before the first query.
package main

import (
	"context"
	"fmt"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/httpapi"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		panic("invalid database configuration")
	}
	cfg.MaxConns = 4
	cfg.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "20000"
	db, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		panic("database unavailable")
	}
	defer db.Close()
	var readOnly string
	if err = db.QueryRow(context.Background(), "SHOW default_transaction_read_only").Scan(&readOnly); err != nil || readOnly != "on" {
		panic("read-only database guard failed")
	}
	server := httpapi.NewServer(nil, catalog.NewService(db), nil)
	handler := api.HandlerFromMux(api.NewStrictHandler(server, nil), http.NewServeMux())
	guarded := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || !(r.URL.Path == "/v1/game/entity-summaries" || strings.HasPrefix(r.URL.Path, "/v1/game/entities/") || r.URL.Path == "/v1/game/products") {
			http.Error(w, "read-only live QA", http.StatusForbidden)
			return
		}
		handler.ServeHTTP(w, r)
	})
	fmt.Println("local catalog probe: 127.0.0.1:58085; PostgreSQL read-only verified")
	err = (&http.Server{Addr: "127.0.0.1:58085", Handler: guarded, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe()
	if err != nil {
		panic(err)
	}
}
