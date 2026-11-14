package catalog

import (
	"context"
	"github.com/jackc/pgx/v5"
	"os"
	"testing"
)

func TestExpansionValidationAndCacheIsolation(t *testing.T) {
	for _, c := range []struct {
		product, scope string
		valid          bool
	}{{"wow", "midnight", true}, {"", "midnight", true}, {"wow", "", true}, {"wow_classic", "midnight", true}, {"wow", "Midnight", false}, {"wow", "' OR true", false}} {
		if (validateExpansion(c.product, c.scope) == nil) != c.valid {
			t.Fatalf("invalid validation %v", c)
		}
	}
	if summaryTotalKey(SummaryParams{}, "wow", "ru_RU", false) == summaryTotalKey(SummaryParams{Expansion: "midnight"}, "wow", "ru_RU", false) {
		t.Fatal("summary cache mixes expansions")
	}
	if listTotalKey(ListParams{}) == listTotalKey(ListParams{Expansion: "midnight"}) {
		t.Fatal("list cache mixes expansions")
	}
}

func TestExpansionPublishedBuildMembership(t *testing.T) {
	url := os.Getenv("MIDNIGHT_SCOPE_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("isolated database required")
	}
	ctx := context.Background()
	db, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close(ctx)
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `CREATE TEMP TABLE catalog_expansions(id int,expansion_key text,product_id int);
 CREATE TEMP TABLE catalog_entity_expansions(expansion_id int,classification text,product_id int,entity_type text,external_id int,build_id int);
 CREATE TEMP TABLE scope_entities(product_id int,entity_type text,external_id int,build_id int);
 INSERT INTO catalog_expansions VALUES(11,'midnight',1),(3,'cataclysm',1);
 INSERT INTO scope_entities VALUES(1,'item',240855,92),(1,'item',52222,92),(1,'item',10,92),(1,'item',11,92),(1,'quest',20,92);
 INSERT INTO catalog_entity_expansions VALUES(11,'confirmed',1,'item',240855,92),(3,'confirmed',1,'item',52222,92),(11,'confirmed',1,'item',10,1599),(11,'review',1,'item',11,92),(11,'confirmed',2,'quest',20,92);`)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		scope string
		want  int
	}{{"", 5}, {"midnight", 1}, {"cataclysm", 1}, {"unknown", 0}} {
		var n int
		err = tx.QueryRow(ctx, "SELECT count(*) FROM scope_entities e CROSS JOIN LATERAL (SELECT e.build_id) v WHERE true"+expansionPredicate(c.scope, "e", "v", "$1")+" AND $1::text IS NOT NULL", c.scope).Scan(&n)
		if err != nil || n != c.want {
			t.Fatalf("scope %q got %d want %d err %v", c.scope, n, c.want, err)
		}
	}
}
