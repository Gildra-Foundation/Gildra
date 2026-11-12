package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/itemscaling"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
)

// TestLiveFetch downloads the reference tables of a real build from Wago and
// recomputes a known weapon. It runs only when a build is named explicitly.
func TestLiveFetch(t *testing.T) {
	build := os.Getenv("ITEM_REFERENCE_LIVE_BUILD")
	if build == "" {
		t.Skip("ITEM_REFERENCE_LIVE_BUILD is required")
	}
	started := time.Now()
	rows, proofs, err := itemscaling.Fetch(context.Background(), wago.TableSource{Client: wago.New(wago.Config{})}, build)
	if err != nil {
		t.Fatal(err)
	}
	tables, err := itemscaling.Parse(rows)
	if err != nil {
		t.Fatal(err)
	}
	var bytes int64
	for _, proof := range proofs {
		if len(proof.SHA256) != 32 || proof.ByteSize <= 0 {
			t.Fatalf("%s has no content proof", proof.Table)
		}
		bytes += proof.ByteSize
	}
	t.Logf("build %s: %d rows from %d sources, %d bytes, %s", build, len(rows), len(proofs), bytes, time.Since(started).Round(time.Second))
	if build == "12.1.0.69587" {
		// Mortalis (47518): official API item level 15, 2-4 damage, speed 2.6.
		numbers, own := tables.Compute(47518, itemscaling.Item{ClassID: 2, SubclassID: 7, InventoryType: 13, Quality: 4, ItemLevel: 35, Flags1: 8705, DelayMS: 2600, DamageVariance: 0.5})
		if !own || numbers.ItemLevel != 15 || numbers.Weapon == nil || numbers.Weapon.Min != 2 || numbers.Weapon.Max != 4 {
			t.Fatalf("%+v %+v", numbers, numbers.Weapon)
		}
	}
}
