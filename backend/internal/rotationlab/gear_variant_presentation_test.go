package rotationlab

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

// Native report fixtures only: no simulator process or external data is used.
func presentationVariantReport(weapon string) []byte {
	return []byte(`{"version":"1210-01","git_revision":"18428cd","sim":{"players":[{"name":"gildra_variant_0","gear":{"main_hand":{"gildra_metadata_version":1,"id":123,"ilevel":133,"required_level":80,"item_class":2,"item_subclass":8,"inventory_type":17,"quality":3,"content_tuning_known":true,"redirected_stats_known":true,"unknown_bonus_count":0,"strength":100` + weapon + `}}}]}}`)
}

func TestVariantPresentationPreservesExactNativeWeapon(t *testing.T) {
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "auction:presentation", Change: GearChange{Slot: "main_hand", ItemID: 123}}}}
	raw := presentationVariantReport(`,"gildra_weapon":{"minDamage":2800,"maxDamage":4200,"dps":1000,"speedSeconds":3.5}`)
	out, err := parseVariantReport(raw, input)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(out.Variants[0])
	if err != nil {
		t.Fatal(err)
	}
	var view map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &view); err != nil {
		t.Fatal(err)
	}
	var weapon map[string]float64
	if err := json.Unmarshal(view["weapon"], &weapon); err != nil {
		t.Fatalf("resolved native weapon was discarded: %s (%v)", encoded, err)
	}
	for key, want := range map[string]float64{"minDamage": 2800, "maxDamage": 4200, "dps": 1000, "speedSeconds": 3.5} {
		if weapon[key] != want {
			t.Fatalf("weapon.%s=%v; want exact native value %v", key, weapon[key], want)
		}
	}
}

func TestVariantPresentationWeaponDPSUsesResolvedTooltipDamage(t *testing.T) {
	// Fresh public Elkardia witness: item248074/context11/13573,6652/drop81.
	// Blizzard reports54–102 /3.6s =>21.666666 DPS. SimC's unrounded DBC
	// budget is21.8141899; it is not the DPS displayed for rounded endpoints.
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "auction:tooltip-dps", Change: GearChange{Slot: "main_hand", ItemID: 123}}}}
	raw := presentationVariantReport(`,"gildra_weapon":{"minDamage":54,"maxDamage":102,"dps":21.814189910888672,"speedSeconds":3.6}`)
	out, err := parseVariantReport(raw, input)
	if err != nil || out.Variants[0].Error != "" || out.Variants[0].Weapon == nil {
		t.Fatalf("valid resolved weapon lost: %+v %v", out, err)
	}
	weapon := out.Variants[0].Weapon
	if weapon.MinDamage != 54 || weapon.MaxDamage != 102 || weapon.SpeedSeconds != 3.6 || math.Abs(weapon.DPS-21.666666666666668) > 0.000001 {
		t.Fatalf("tooltip weapon facts differ from resolved damage/speed: %+v", weapon)
	}
}

func TestVariantPresentationRejectsInvalidNativeWeapon(t *testing.T) {
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "auction:presentation", Change: GearChange{Slot: "main_hand", ItemID: 123}}}}
	for _, weapon := range []string{
		`{"minDamage":-1,"maxDamage":4200,"dps":1000,"speedSeconds":3.5}`,
		`{"minDamage":2800,"maxDamage":100,"dps":1000,"speedSeconds":3.5}`,
		`{"minDamage":2800,"maxDamage":4200,"dps":1000,"speedSeconds":0}`,
		`{"minDamage":2800,"maxDamage":4200,"dps":1000}`,
	} {
		out, err := parseVariantReport(presentationVariantReport(`,"gildra_weapon":`+weapon), input)
		if err == nil && out.Variants[0].Error == "" {
			t.Errorf("invalid claimed native weapon accepted: %s", weapon)
		}
	}
}

func TestVariantPresentationMissingOptionalFactsNeverInventsThem(t *testing.T) {
	input := GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81, Variants: []GearVariantInput{{Key: "auction:presentation", Change: GearChange{Slot: "main_hand", ItemID: 123}}}}
	out, err := parseVariantReport(presentationVariantReport(""), input)
	if err != nil || out.Variants[0].Error != "" {
		t.Fatalf("older metadata without optional presentation must remain usable: %+v %v", out, err)
	}
	encoded, _ := json.Marshal(out.Variants[0])
	if strings.Contains(string(encoded), `"weapon":{`) || strings.Contains(string(encoded), `"effectsVerified":true`) {
		t.Fatalf("missing presentation was invented: %s", encoded)
	}
}
