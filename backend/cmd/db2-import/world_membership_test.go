package main

import (
	"context"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func TestWorldMembershipRealSource(t *testing.T) {
	dsn := os.Getenv("WORLD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated WORLD fixture required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err = db.QueryRow(ctx, `SELECT current_database()='world' AND EXISTS(SELECT 1 FROM catalog_snapshots WHERE metadata->>'fixture'='WORLD read-only production export')`).Scan(&safe); err != nil || !safe {
		t.Fatalf("unsafe fixture %v", err)
	}
	ic := catalogimport.ImportContext{BuildID: 92, ProductID: 1}
	if err = db.QueryRow(ctx, `SELECT id FROM catalog_snapshots WHERE build_id=92 LIMIT 1`).Scan(&ic.SnapshotID); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(ctx, `INSERT INTO game_namespaces(product_id,region,kind,slug) VALUES(1,'us','static','static-us') ON CONFLICT(product_id,slug) DO UPDATE SET region=EXCLUDED.region RETURNING id`).Scan(&ic.NamespaceID); err != nil {
		t.Fatal(err)
	}
	if _, err = projectCreatures(ctx, db, ic); err != nil {
		t.Fatal(err)
	}
	if err = projectMidnightMembership(ctx, db, ic); err != nil {
		t.Fatal(err)
	}
	var n, again int
	if err = db.QueryRow(ctx, `SELECT count(*) FROM catalog_entity_expansions WHERE build_id=92 AND classification='confirmed'`).Scan(&n); err != nil || n < 10000 {
		t.Fatalf("membership %d %v", n, err)
	}
	if err = projectMidnightMembership(ctx, db, ic); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(ctx, `SELECT count(*) FROM catalog_entity_expansions WHERE build_id=92 AND classification='confirmed'`).Scan(&again); err != nil || n != again {
		t.Fatalf("idempotence %d %d %v", n, again, err)
	}
	if _, err = db.Exec(ctx, `UPDATE game_entities SET published_version_id=latest_version_id WHERE id=(SELECT id FROM game_entities WHERE entity_type='map' LIMIT 1)`); err != nil {
		t.Fatal(err)
	}
	err = projectMidnightMembership(ctx, db, ic)
	_, cleanup := db.Exec(ctx, `UPDATE game_entities SET published_version_id=NULL WHERE published_version_id IS NOT NULL`)
	if cleanup != nil {
		t.Fatal(cleanup)
	}
	if err == nil {
		t.Fatal("published build accepted")
	}
	t.Logf("%d memberships; repeat identical; published build rejected", n)
}

func TestWorldSourceDefaults(t *testing.T) {
	defaults := withWorldSourceTables(splitList(defaultTables))
	for _, table := range []string{"ContentTuning", "CurrencyCategory", "ParagonReputation"} {
		if !contains(defaults, table) {
			t.Errorf("missing %s", table)
		}
	}
	partial := []string{"Map"}
	if got := withWorldSourceTables(partial); len(got) != 1 || got[0] != "Map" {
		t.Fatal("explicit table selection changed")
	}
}
