package rotationlab

import (
	"encoding/json"
	"os"
	"testing"
)

func enhancementReport(t *testing.T, edits func(map[string]any)) GearVariantMetadata {
	t.Helper()
	item := map[string]any{"gildra_metadata_version": 2, "id": 123, "ilevel": 133, "required_level": 80, "item_class": 4, "item_subclass": 4, "inventory_type": 1, "quality": 3, "content_tuning_known": true, "redirected_stats_known": true, "unknown_bonus_count": 0, "crit_rating": 20,
		"socket_colors": []int{7, 24, 0}, "socket_bonus_id": 321, "required_profession_id": 202, "required_profession_rank": 50}
	edits(item)
	raw, err := json.Marshal(map[string]any{"version": "1210-01", "git_revision": "18428cd", "sim": map[string]any{"players": []any{map[string]any{"name": "gildra_variant_0", "gear": map[string]any{"head": item}}}}})
	if err != nil {
		t.Fatal(err)
	}
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "exact:123", Change: GearChange{Slot: "head", ItemID: 123}}}}
	result, err := parseVariantReport(raw, input)
	if err != nil {
		t.Fatal(err)
	}
	return result.Variants[0]
}
func TestEnhancementV3PreservesResolvedSocketsAndRequirements(t *testing.T) {
	result := enhancementReport(t, func(map[string]any) {})
	e := result.Enhancements
	if result.Error != "" || result.MetadataVersion != 3 || e.Status != "verified" || *e.SocketCount != 2 || len(e.SocketColors) != 3 || e.SocketColors[0] != 14 || e.SocketColors[1] != 0x1000000 || e.SocketColors[2] != 0 || *e.SocketBonusID != 321 || *e.RequiredProfessionID != 202 || *e.RequiredProfessionRank != 50 {
		t.Fatalf("lost resolved facts: %+v %+v", result, e)
	}
	if result.Stats["crit_rating"] != 20 {
		t.Fatal("basic metadata changed")
	}
}
func TestEnhancementV1IsUnknownButBasicItemRemainsAllowed(t *testing.T) {
	result := enhancementReport(t, func(item map[string]any) { item["gildra_metadata_version"] = 1 })
	if result.Error != "" || result.MetadataVersion != 1 || result.ItemLevel != 133 || result.Enhancements.Status != "unknown" || result.Enhancements.SocketColors != nil || result.Enhancements.SocketBonusID != nil {
		t.Fatalf("legacy data overclaimed: %+v", result)
	}
	raw, _ := json.Marshal(result.Enhancements)
	if string(raw) != `{"status":"unknown"}` {
		t.Fatalf("unknown must not imply verified zero: %s", raw)
	}
}
func TestEnhancementV3VerifiedAbsence(t *testing.T) {
	result := enhancementReport(t, func(item map[string]any) {
		item["socket_colors"] = []int{0, 0, 0}
		item["socket_bonus_id"] = 0
		item["required_profession_id"] = 0
		item["required_profession_rank"] = 0
	})
	raw, _ := json.Marshal(result.Enhancements)
	if result.Error != "" || result.Enhancements.Status != "verified" || *result.Enhancements.SocketCount != 0 || *result.Enhancements.SocketBonusID != 0 {
		t.Fatalf("verified absence lost: %s", raw)
	}
}
func TestEnhancementV3RejectsInvalidSocketShapes(t *testing.T) {
	for _, bad := range []any{nil, 0, "14,0,0", []int{}, []int{14}, []int{14, 0}, []int{14, 0, 0, 0}, []any{14, nil, 0}, []any{14, "0", 0}, []any{14, 1.5, 0}, []int{-1, 0, 0}, []int{31, 0, 0}, []int{0x200000, 0, 0}, []int{2147483647, 0, 0}} {
		result := enhancementReport(t, func(item map[string]any) { item["socket_colors"] = bad })
		if result.Error != "item_variant_unverified" || result.Enhancements.Status != "unknown" {
			t.Fatalf("invalid sockets accepted %v: %+v", bad, result)
		}
	}
}
func TestEnhancementV3MissingOrMalformedRequirementsFailClosed(t *testing.T) {
	for _, key := range []string{"socket_colors", "socket_bonus_id", "required_profession_id", "required_profession_rank"} {
		result := enhancementReport(t, func(item map[string]any) { delete(item, key) })
		if result.Error != "item_variant_unverified" {
			t.Fatalf("missing %s accepted", key)
		}
	}
	for _, key := range []string{"socket_bonus_id", "required_profession_id", "required_profession_rank"} {
		for _, bad := range []any{nil, -1, 1.5, "0", 2147483648} {
			result := enhancementReport(t, func(item map[string]any) { item[key] = bad })
			if result.Error != "item_variant_unverified" {
				t.Fatalf("invalid %s=%v accepted", key, bad)
			}
		}
	}
	result := enhancementReport(t, func(item map[string]any) { item["required_profession_id"] = 0 })
	if result.Error != "item_variant_unverified" {
		t.Fatal("rank without profession accepted")
	}
}
func TestEnhancementV3DoesNotBypassExistingVerification(t *testing.T) {
	for key, value := range map[string]any{"unknown_bonus_count": 1, "content_tuning_known": false, "redirected_stats_known": false, "id": 456, "ilevel": 0} {
		result := enhancementReport(t, func(item map[string]any) { item[key] = value })
		if result.Error != "item_variant_unverified" || result.Enhancements.Status != "unknown" {
			t.Fatalf("%s bypassed validation: %+v", key, result)
		}
	}
}

// SocketType is an index; accepting the old mask as an index silently changes
// FIRE into PRISMATIC. Keep both values in the same regression.
func TestEnhancementV3SeparatesSocketIndicesFromMasks(t *testing.T) {
	for raw, expected := range map[int]int{0: 0, 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 14, 13: 0x800, 14: 0x1000, 22: 0x700000, 24: 0x1000000, 30: 0x40000000} {
		result := enhancementReport(t, func(item map[string]any) { item["socket_colors"] = []int{raw, 0, 0} })
		if result.Error != "" || result.MetadataVersion != 3 || result.Enhancements.SocketColors[0] != expected {
			t.Fatalf("raw %d: %+v", raw, result)
		}
	}
	for _, raw := range []int{-1, 31, 32, 0x40, 0x1000000} {
		result := enhancementReport(t, func(item map[string]any) { item["socket_colors"] = []int{raw, 0, 0} })
		if result.Error != "item_variant_unverified" {
			t.Fatalf("unknown/mask-valued raw socket %d accepted", raw)
		}
	}
}

// Captured from the pinned 18428cd SimC binary using real public item 240948,
// bonus IDs 4785/12248/12249. This fixture is the unmodified report fragment,
// not a hand-written API-mask fixture. Its prismatic SocketType is 7.
func TestEnhancementV3RealNativeSocketReport(t *testing.T) {
	raw, err := os.ReadFile("testdata/socket-metadata-v2-live.json")
	if err != nil {
		t.Fatal(err)
	}
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 90, Variants: []GearVariantInput{{Key: "live:240948", Change: GearChange{Slot: "neck", ItemID: 240948}}}}
	result, err := parseVariantReport(raw, input)
	if err != nil {
		t.Fatal(err)
	}
	got := result.Variants[0]
	if got.Error != "" || got.MetadataVersion != 3 || got.ItemLevel != 165 || got.RequiredLevel != 81 || got.Enhancements.Status != "verified" || got.Enhancements.SocketColors[0] != 14 || *got.Enhancements.SocketCount != 1 {
		t.Fatalf("live socket not normalized: %+v", got)
	}
}

func TestNativeNoItemEffectsRequiresPositiveProof(t *testing.T) {
	for _, value := range []any{nil, false, "true", true} {
		row := enhancementReport(t, func(item map[string]any) {
			item["gildra_no_item_effects"] = value
		})
		if row.NativeNoItemEffects != (value == true) {
			t.Fatalf("unexpected absence proof for %v", value)
		}
	}
}

func TestAppliedStatsRequireCompleteNativeVector(t *testing.T) {
	values := make([]any, 46)
	for i := range values {
		values[i] = float64(i)
	}
	row := enhancementReport(t, func(item map[string]any) { item["gildra_applied_stats_v1"] = values })
	if len(row.AppliedStatsV1) != len(values) || row.AppliedStatsV1[39] != 39 {
		t.Fatal("lost native stat coordinates")
	}
	values[39] = nil
	for _, invalid := range []any{nil, values, values[:45]} {
		row := enhancementReport(t, func(item map[string]any) { item["gildra_applied_stats_v1"] = invalid })
		if row.AppliedStatsV1 != nil {
			t.Fatal("partial vector qualified for simulation reuse")
		}
	}
}

func TestNativeScalingInputsRequireCompleteAuditedEvidence(t *testing.T) {
	for _, raw := range []string{"", "null", "[]", "[0,0,0]", "[0,0,0,0,0]", "[0,null,0,0]", "[0,-1,0,0]", "[0,1.5,0,0]", "[0,2147483648,0,0]"} {
		if nativeScalingInputsV1("18428cd", json.RawMessage(raw)) != nil {
			t.Fatalf("accepted invalid scaling inputs %q", raw)
		}
	}
	for _, rev := range []string{"", "18428c", "18428cd0", "abcdef0"} {
		if nativeScalingInputsV1(rev, json.RawMessage("[0,0,0,0]")) != nil {
			t.Fatalf("accepted unaudited revision %q", rev)
		}
	}
	for _, want := range [][4]int{{}, {67, 67, 82, 67}} {
		row := enhancementReport(t, func(item map[string]any) { item["gildra_scaling_inputs_v1"] = want })
		if row.NativeScalingInputsV1 == nil || *row.NativeScalingInputsV1 != want {
			t.Fatalf("lost verified native scaling inputs %v", want)
		}
	}
}

func TestNativeSuffixProgramBindsOrderedOperandsAndSingleBonus(t *testing.T) {
	// Real pinned report for Smoldering Breastplate (116427), bonus 47.
	fields := []int{47, 2, 32, 2827, 0, 0, 0, 2, 49, 3905, 0, 0, 1, 5, 13151, 0, 0, 0, 2}
	encode := func() json.RawMessage { raw, _ := json.Marshal(fields); return raw }
	const digest = "2ec7af8595b4e939e9342dc33cde19cbb2741a404c5741e491f595ed72e791dd"
	if got := nativeSuffixProgramV1([]int{47}, encode()); got != digest {
		t.Fatalf("unexpected suffix program: %q", got)
	}
	for _, ids := range [][]int{nil, {}, {47, 13708}, {68}, {501}} {
		if nativeSuffixProgramV1(ids, encode()) != "" {
			t.Fatalf("accepted suffix program for native request %v", ids)
		}
	}
	fields[0] = 68 // This bonus carries identical unrounded DBC operations.
	if got := nativeSuffixProgramV1([]int{68}, encode()); got != digest {
		t.Fatal("lost exact DBC alias")
	}
	fields[3]++
	if got := nativeSuffixProgramV1([]int{68}, encode()); got == "" || got == digest {
		t.Fatal("conflated different stat allocations")
	}
	fields[13] = 4 // Description tags can alter the effects of other gear.
	if nativeSuffixProgramV1([]int{68}, encode()) != "" {
		t.Fatal("accepted cross-item description tag")
	}
	for _, invalid := range []json.RawMessage{nil, json.RawMessage("[]"), json.RawMessage("[68,2,null]")} {
		if nativeSuffixProgramV1([]int{68}, invalid) != "" {
			t.Fatalf("accepted partial native suffix program: %s", invalid)
		}
	}
}

func TestNativeCraftedSymmetryNeedsBothMatchingOrderedRatings(t *testing.T) {
	modifiers := []ItemModifier{{Type: 30, Value: 40}, {Type: 29, Value: 36}}
	for _, tc := range []struct {
		revision, raw string
		want          bool
	}{
		{"18428cd", "[36,40]", true}, {"18428cd", "[40,36]", false}, {"18428cd", "[36,36]", false},
		{"18428cd", "[36,null]", false}, {"18428cd", "[]", false}, {"other", "[36,40]", false},
	} {
		if got := nativeCraftedSymmetryV1(tc.revision, modifiers, []byte(tc.raw)); got != tc.want {
			t.Fatalf("%+v got %v", tc, got)
		}
	}
}
