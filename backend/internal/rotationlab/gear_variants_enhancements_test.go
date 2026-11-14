package rotationlab

import (
	"encoding/json"
	"testing"
)

func enhancementReport(t *testing.T, edits func(map[string]any)) GearVariantMetadata {
	t.Helper()
	item := map[string]any{"gildra_metadata_version": 2, "id": 123, "ilevel": 133, "required_level": 80, "item_class": 4, "item_subclass": 4, "inventory_type": 1, "quality": 3, "content_tuning_known": true, "redirected_stats_known": true, "unknown_bonus_count": 0, "crit_rating": 20,
		"socket_colors": []int{14, 0x1000000, 0}, "socket_bonus_id": 321, "required_profession_id": 202, "required_profession_rank": 50}
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
func TestEnhancementV2PreservesResolvedSocketsAndRequirements(t *testing.T) {
	result := enhancementReport(t, func(map[string]any) {})
	e := result.Enhancements
	if result.Error != "" || result.MetadataVersion != 2 || e.Status != "verified" || *e.SocketCount != 2 || len(e.SocketColors) != 3 || e.SocketColors[0] != 14 || e.SocketColors[1] != 0x1000000 || e.SocketColors[2] != 0 || *e.SocketBonusID != 321 || *e.RequiredProfessionID != 202 || *e.RequiredProfessionRank != 50 {
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
func TestEnhancementV2VerifiedAbsence(t *testing.T) {
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
func TestEnhancementV2RejectsInvalidSocketShapes(t *testing.T) {
	for _, bad := range []any{nil, 0, "14,0,0", []int{}, []int{14}, []int{14, 0}, []int{14, 0, 0, 0}, []any{14, nil, 0}, []any{14, "0", 0}, []any{14, 1.5, 0}, []int{-1, 0, 0}, []int{3, 0, 0}, []int{0x200000, 0, 0}, []int{2147483647, 0, 0}} {
		result := enhancementReport(t, func(item map[string]any) { item["socket_colors"] = bad })
		if result.Error != "item_variant_unverified" || result.Enhancements.Status != "unknown" {
			t.Fatalf("invalid sockets accepted %v: %+v", bad, result)
		}
	}
}
func TestEnhancementV2MissingOrMalformedRequirementsFailClosed(t *testing.T) {
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
func TestEnhancementV2DoesNotBypassExistingVerification(t *testing.T) {
	for key, value := range map[string]any{"unknown_bonus_count": 1, "content_tuning_known": false, "redirected_stats_known": false, "id": 456, "ilevel": 0} {
		result := enhancementReport(t, func(item map[string]any) { item[key] = value })
		if result.Error != "item_variant_unverified" || result.Enhancements.Status != "unknown" {
			t.Fatalf("%s bypassed validation: %+v", key, result)
		}
	}
}
