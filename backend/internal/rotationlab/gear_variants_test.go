package rotationlab

import (
	"strings"
	"testing"
)

func TestAuctionModifierSerializationAndBounds(t *testing.T) {
	change := GearChange{Slot: "head", ItemID: 123, ContextID: 23, BonusIDs: []int{6657}, Modifiers: []ItemModifier{{9, 81}, {28, 502}, {29, 40}, {30, 49}, {39, 123456}, {64, 251220}}}
	if err := validateItemModifiers(change); err != nil {
		t.Fatal(err)
	}
	line := serializeGearChange(change)
	for _, part := range []string{"source=local", "context=23", "drop_level=81", "content_tuning=502", "crafted_stats=40/49", "redirected_base_stats=251220", "bonus_id=6657"} {
		if !strings.Contains(line, part) {
			t.Fatalf("missing %s in %s", part, line)
		}
	}
	if strings.Contains(line, "123456") {
		t.Fatal("reagent identity must not be serialized as a stat")
	}
	for _, mods := range [][]ItemModifier{{{9, 91}}, {{28, -1}}, {{29, 999}}, {{28, 1}, {28, 2}}, {{1000, 1}}} {
		change.Modifiers = mods
		if validateItemModifiers(change) == nil {
			t.Fatalf("invalid modifiers accepted: %+v", mods)
		}
	}
}
func TestVariantReportRequiresNativeMetadataAndRejectsUnknownBonuses(t *testing.T) {
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "auction:abc", Change: GearChange{Slot: "head", ItemID: 123}}}}
	raw := `{"version":"1210-01","git_revision":"18428cd","sim":{"players":[{"name":"gildra_variant_0","gear":{"head":{"gildra_metadata_version":1,"id":123,"ilevel":133,"required_level":80,"item_class":4,"item_subclass":4,"inventory_type":1,"quality":3,"content_tuning_known":true,"redirected_stats_known":true,"unknown_bonus_count":0,"strint":100,"crit_rating":20}}}]}}`
	out, err := parseVariantReport([]byte(raw), input)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Variants) != 1 || out.Variants[0].ItemLevel != 133 || out.Variants[0].RequiredLevel != 80 || out.Variants[0].Stats["strint"] != 100 || out.Variants[0].Stats["crit_rating"] != 20 || out.Variants[0].Error != "" {
		t.Fatalf("bad metadata: %+v", out)
	}
	_, err = parseVariantReport([]byte(strings.Replace(raw, `"gildra_metadata_version":1`, `"gildra_metadata_version":0`, 1)), input)
	if err != errVariantMetadataMissing {
		t.Fatalf("unpatched report accepted: %v", err)
	}
	out, err = parseVariantReport([]byte(strings.Replace(raw, `"unknown_bonus_count":0`, `"unknown_bonus_count":1`, 1)), input)
	if err != nil || out.Variants[0].Error != "item_variant_unverified" {
		t.Fatalf("unknown bonus accepted: %+v %v", out, err)
	}
	out, err = parseVariantReport([]byte(strings.Replace(raw, `"ilevel":133`, `"ilevel":4294967291`, 1)), input)
	if err != nil || out.Variants[0].Error != "item_variant_unverified" {
		t.Fatalf("overflowed item level accepted: %+v %v", out, err)
	}
}
func TestVariantRequestRejectsUnsafeIdentifiersAndOversizedBatches(t *testing.T) {
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "good", Change: GearChange{Slot: "head", ItemID: 123}}}}
	if err := validateVariantRequest(input); err != nil {
		t.Fatal(err)
	}
	input.Variants[0].Key = "bad\niterations=1"
	if validateVariantRequest(input) == nil {
		t.Fatal("unsafe key accepted")
	}
	input.Variants[0].Key = "good"
	input.Variants[0].Change.Slot = "head\niterations=1"
	if validateVariantRequest(input) == nil {
		t.Fatal("unsafe slot accepted")
	}
	input.Variants = make([]GearVariantInput, 17)
	if validateVariantRequest(input) == nil {
		t.Fatal("oversized batch accepted")
	}
}
