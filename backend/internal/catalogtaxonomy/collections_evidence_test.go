package catalogtaxonomy

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
	"time"
)

// This opt-in rehearsal uses the real published-build rows exported read-only
// into an isolated full-schema database. It is not a production repair path.
func TestCollectionRealSourceRehearsal(t *testing.T) {
	dsn := os.Getenv("COLLECTIONS_REAL_DATABASE_URL")
	if dsn == "" {
		t.Skip("real-source disposable fixture required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err := db.QueryRow(ctx, `SELECT current_database()='collections' AND EXISTS(SELECT 1 FROM catalog_snapshots WHERE metadata ? 'fixture')`).Scan(&safe); err != nil || !safe {
		t.Fatalf("real-source rehearsal requires the isolated collections fixture: %v", err)
	}
	start := time.Now()
	err = New(db).projectionTransaction(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SET LOCAL statement_timeout='10min'`); err != nil {
			return err
		}
		for n, statement := range strings.Split(projectionSQL(collectionDetailsSQL), ";\n") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			step := time.Now()
			if _, err := tx.Exec(ctx, statement, pgx.QueryExecModeSimpleProtocol); err != nil {
				return err
			}
			t.Logf("detail statement %d: %s", n+1, time.Since(step))
		}
		for n, statement := range strings.Split(projectionSQL(collectionLinksSQL), ";\n") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			step := time.Now()
			if _, err := tx.Exec(ctx, statement, pgx.QueryExecModeSimpleProtocol); err != nil {
				return err
			}
			t.Logf("link statement %d: %s", n+1, time.Since(step))
		}
		_, err := tx.Exec(ctx, tooltipSQLForEntityTypes("mount", "battle_pet", "toy", "transmog_set", "item_set"))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("real collection projection completed in %s", time.Since(start))
}
