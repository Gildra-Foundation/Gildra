package catalogtaxonomy

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func TestWorldRealSourceProjection(t *testing.T) {
	dsn := os.Getenv("WORLD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("disposable WORLD fixture required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err = db.QueryRow(ctx, `SELECT current_database()='world' AND EXISTS(SELECT 1 FROM catalog_snapshots WHERE metadata->>'fixture'='WORLD read-only production export')`).Scan(&safe); err != nil || !safe {
		t.Fatalf("unsafe fixture: %v", err)
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT set_config('gildra.projection_product','wow',true)`); err != nil {
		t.Fatal(err)
	}
	var before, after, again int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE attributes->>'projection'='db2_world'`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err = rebuildWorldLinks(ctx, tx); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE attributes->>'projection'='db2_world'`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after < 10000 {
		t.Fatalf("unexpectedly few source-backed links: %d", after)
	}
	if err = rebuildWorldLinks(ctx, tx); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE attributes->>'projection'='db2_world'`).Scan(&again); err != nil {
		t.Fatal(err)
	}
	if again != after {
		t.Fatalf("not idempotent: %d / %d", after, again)
	}
	var invalid int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links l WHERE l.attributes->>'projection'='db2_world' AND (l.source_entity_id=l.target_entity_id OR NOT EXISTS(SELECT 1 FROM game_entity_versions v WHERE v.entity_id=l.target_entity_id AND v.build_id=l.build_id))`).Scan(&invalid); err != nil || invalid != 0 {
		t.Fatalf("invalid target: %d %v", invalid, err)
	}
	// A single published pointer makes the entire build immutable.
	if _, err = tx.Exec(ctx, `UPDATE game_entities SET published_version_id=latest_version_id WHERE id=(SELECT id FROM game_entities WHERE entity_type='map' LIMIT 1)`); err != nil {
		t.Fatal(err)
	}
	if err = rebuildWorldLinks(ctx, tx); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links WHERE attributes->>'projection'='db2_world'`).Scan(&again); err != nil || again != after {
		t.Fatalf("published data changed: %d / %d %v", again, after, err)
	}
	if _, err = tx.Exec(ctx, `UPDATE game_entities SET published_version_id=NULL WHERE published_version_id IS NOT NULL`); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	t.Logf("source links %d -> %d; repeat %d; published guard passed", before, after, again)
}
