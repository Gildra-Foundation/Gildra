package rotationlab

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestNativeMetadataCacheResolvesCurrentRequest(t *testing.T) {
	dir := t.TempDir()
	binary := filepath.Join(dir, "simc")
	if err := os.WriteFile(binary, []byte("#!/bin/sh\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	engine, err := NewSimCEngine(binary, "", 100)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(binary)
	if err != nil {
		t.Fatal(err)
	}
	in := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "first", Change: GearChange{Slot: "head", ItemID: 101}}, {Key: "second", Change: GearChange{Slot: "chest", ItemID: 102}}}}
	engine.variants.store(info, gearVariantKeys(in), GearVariantResponse{Engine: "SimulationCraft fixture", Variants: []GearVariantMetadata{{ItemID: 101, Stats: map[string]float64{"strength": 5}}, {ItemID: 102}}})
	in.Variants[0], in.Variants[1] = in.Variants[1], in.Variants[0]
	in.Variants[1].Key = "relabeled"
	hit, err := engine.ResolveGearVariants(context.Background(), in)
	if err != nil || hit.Variants[0].ItemID != 102 || hit.Variants[1].Key != "relabeled" || hit.Engine != "SimulationCraft fixture" {
		t.Fatalf("unexpected cached response: %+v %v", hit, err)
	}
	hit.Variants[1].Stats["strength"] = 80
	again, err := engine.ResolveGearVariants(context.Background(), in)
	if err != nil || again.Variants[1].Stats["strength"] != 5 {
		t.Fatal("caller mutated the native cache", err)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = engine.ResolveGearVariants(cancelled, in); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled hit returned", err)
	}
	for _, different := range []GearVariantRequest{{Spec: in.Spec, CharacterLevel: 80, Variants: in.Variants}, {Spec: "arms-warrior", CharacterLevel: 81, Variants: in.Variants}, {Spec: in.Spec, CharacterLevel: 81, Variants: []GearVariantInput{{Key: "relabeled", Change: GearChange{ItemID: 101, Slot: "head", BonusIDs: []int{55}}}}}} {
		for _, h := range engine.variants.lookup(info, gearVariantKeys(different)) {
			if h.engine != "" {
				t.Fatal("reused wrong native input")
			}
		}
	}
	if err = os.Rename(binary, binary+".old"); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(binary, []byte("#!/bin/sh\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if fresh, runErr := engine.ResolveGearVariants(context.Background(), in); runErr == nil && (fresh.Engine != "" || fresh.Variants[0].Error != "item_resolution_failed") {
		t.Fatal("reused metadata after executable replacement")
	}
}

func TestNativeMetadataPartialHitPreservesFailureAndDoesNotCacheIt(t *testing.T) {
	dir := t.TempDir()
	binary := filepath.Join(dir, "simc")
	logPath := filepath.Join(dir, "calls")
	t.Setenv("NATIVE_FIXTURE_LOG", logPath)
	if err := os.WriteFile(binary, []byte("#!/bin/sh\necho called >> \"$NATIVE_FIXTURE_LOG\"\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	engine, err := NewSimCEngine(binary, "", 100)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(binary)
	if err != nil {
		t.Fatal(err)
	}
	in := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{
		{Key: "missing", Change: GearChange{Slot: "head", ItemID: 101}},
		{Key: "cached", Change: GearChange{Slot: "chest", ItemID: 102}},
	}}
	in.Variants = append(in.Variants, GearVariantInput{Key: "reagent-alias", Change: GearChange{Slot: "head", ItemID: 101, Modifiers: []ItemModifier{{Type: 38, Value: 55}}}})
	engine.variants.store(info, gearVariantKeys(in)[1:2], GearVariantResponse{Engine: "fixture", Variants: []GearVariantMetadata{{ItemID: 102}}})
	for i := 0; i < 2; i++ {
		out, err := engine.ResolveGearVariants(context.Background(), in)
		if err != nil {
			t.Fatal(err)
		}
		if len(out.Variants) != 3 || out.Variants[2].Error != "item_resolution_failed" || out.Variants[2].Key != "reagent-alias" || out.Engine != "fixture" || out.Variants[0].Error != "item_resolution_failed" ||
			out.Variants[0].Key != "missing" || out.Variants[1].Key != "cached" || out.Variants[1].ItemID != 102 {
			t.Fatalf("mixed response lost its ordering or failure: %+v", out)
		}
	}
	calls, err := os.ReadFile(logPath)
	if err != nil || string(calls) != "called\ncalled\n" {
		t.Fatalf("expected one native retry of the missing row per request: %q, %v", calls, err)
	}
}

func TestReagentAliasPreservesEveryCombatInput(t *testing.T) {
	base := GearChange{Slot: "main_hand", ItemID: 123, ContextID: 13, BonusIDs: []int{200, 201}, Modifiers: []ItemModifier{{Type: 9, Value: 90}, {Type: 29, Value: 32}}}
	key := func(change GearChange) gearVariantKey {
		return gearVariantKeys(GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 90, Variants: []GearVariantInput{{Key: "lot", Change: change}}})[0]
	}
	alias := base
	alias.Modifiers = []ItemModifier{{Type: 38, Value: 3}, base.Modifiers[0], {Type: 51, Value: 4}, base.Modifiers[1]}
	if key(alias) != key(base) || serializeGearChange(alias) != serializeGearChange(base) || len(alias.Modifiers) != 4 || alias.Modifiers[0].Type != 38 {
		t.Fatal("reagent alias changed the source lot, native profile or cache identity")
	}
	for _, edit := range []func(*GearChange){
		func(c *GearChange) { c.Slot = "off_hand" }, func(c *GearChange) { c.ContextID++ }, func(c *GearChange) { c.EnchantID = 1 }, func(c *GearChange) { c.GemIDs = []int{2} },
		func(c *GearChange) { c.BonusIDs = []int{201, 200} }, func(c *GearChange) { c.Modifiers = []ItemModifier{{Type: 9, Value: 89}, {Type: 29, Value: 32}} },
		func(c *GearChange) { c.Modifiers = append(c.Modifiers, ItemModifier{Type: 64, Value: 1}) },
	} {
		other := base
		edit(&other)
		if key(other) == key(base) {
			t.Fatalf("merged a different native input: %+v", other)
		}
	}
}
