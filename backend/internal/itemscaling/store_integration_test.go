package itemscaling

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestStoreAndLoad writes the reference tables of a build from unmodified
// source exports into an isolated database with migration 00183 and reads
// them back. It never runs without an explicitly isolated database.
func TestStoreAndLoad(t *testing.T) {
	dsn, dir := os.Getenv("ITEMS_TEST_DATABASE_URL"), os.Getenv("ITEMS_SOURCE_DIR")
	if dsn == "" || dir == "" {
		t.Skip("ITEMS_TEST_DATABASE_URL and ITEMS_SOURCE_DIR are required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var buildID int64
	if err := db.QueryRow(ctx, `SELECT build_id FROM catalog_snapshots WHERE metadata->>'fixture' LIKE 'ITEMS isolated%' LIMIT 1`).Scan(&buildID); err != nil {
		t.Fatal("not the ITEMS fixture database: ", err)
	}
	if _, err := Load(ctx, db, buildID+1000); !errors.Is(err, ErrNotImported) {
		t.Fatalf("a build without tables: %v", err)
	}
	rows, proofs, err := Fetch(ctx, directorySource{t, dir}, "12.1.0.69587")
	if err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 2; attempt++ { // replacing a build's tables is repeatable
		if err := Store(ctx, db, buildID, rows, proofs); err != nil {
			t.Fatal(err)
		}
	}
	var stored, sources int
	if err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM catalog_item_reference_rows WHERE build_id=$1),
		(SELECT count(*) FROM catalog_item_reference_sources WHERE build_id=$1)`, buildID).Scan(&stored, &sources); err != nil {
		t.Fatal(err)
	}
	if stored != len(rows) || sources != len(proofs) {
		t.Fatalf("stored %d rows of %d, %d sources of %d", stored, len(rows), sources, len(proofs))
	}
	loaded, err := Load(ctx, db, buildID)
	if err != nil {
		t.Fatal(err)
	}
	direct, err := Parse(rows)
	if err != nil {
		t.Fatal(err)
	}
	// Mortalis (47518): a Wrath of the Lich King sword, stored level 35.
	item := Item{ClassID: 2, SubclassID: 7, InventoryType: 13, Quality: 4, ItemLevel: 35, Flags1: 8705, DelayMS: 2600, DamageVariance: 0.5}
	got, _ := loaded.Compute(47518, item)
	want, _ := direct.Compute(47518, item)
	if got.ItemLevel != 15 || got.Weapon == nil || *got.Weapon != *want.Weapon || got.Weapon.Min != 2 || got.Weapon.Max != 4 {
		t.Fatalf("loaded %+v %+v, direct %+v", got, got.Weapon, want)
	}
	if loaded.EnchantmentNameRU(2686) == "" && len(loaded.enchantRU) == 0 {
		t.Fatal("Russian enchantment texts were not stored")
	}
	t.Logf("build %d: %d rows in %d tables", buildID, stored, sources)
}
