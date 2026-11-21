package rotationlab

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

func TestArmorBatchPreservesObservedStatsAndPhysicalRows(t *testing.T) {
	row := func(feet, head int) batchCandidate {
		return batchCandidate{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: feet}, {SlotType: "HEAD", ItemID: 2, EnchantID: head}}}
	}
	physical := []batchCandidate{row(7962, 8014), row(7992, 8014), row(8018, 8014), row(7963, 8014), row(7962, 7988), row(7962, 7990)}
	for _, tc := range []struct {
		name  string
		reads byte
		extra int
	}{
		{"no tertiary read", 0, 0}, {"speed affects damage", armorSpeed, 2}, {"legacy engine", allArmorRatings, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var sizes []int
			score := func(row batchCandidate) float64 {
				// Every protected dimension and unknown enchant changes the reference result.
				v := float64(-armorEnchantKey("FEET", row.OwnedChanges[0].EnchantID, tc.reads))
				return v*10000 - float64(armorEnchantKey("HEAD", row.OwnedChanges[1].EnchantID, tc.reads))
			}
			got, err := simulateArmorBatch(physical, true, func(rows []batchCandidate, reads *byte) ([]batchMeasurement, error) {
				sizes = append(sizes, len(rows))
				if reads != nil && tc.reads != allArmorRatings {
					*reads = tc.reads
				}
				out := make([]batchMeasurement, len(rows))
				for i, r := range rows {
					out[i].DPSMean = score(r)
				}
				return out, nil
			})
			want := []int{3}
			if tc.extra > 0 {
				want = append(want, tc.extra)
			}
			if err != nil || !reflect.DeepEqual(sizes, want) {
				t.Fatalf("calls %v, want %v, error %v", sizes, want, err)
			}
			for i, r := range physical {
				if got[i].DPSMean != score(r) {
					t.Fatalf("physical row %d: %+v", i, got[i])
				}
			}
		})
	}
	errFallback := errors.New("unresolved physical fight failed")
	got, err := simulateArmorBatch(physical, true, func(rows []batchCandidate, reads *byte) ([]batchMeasurement, error) {
		if reads == nil {
			return nil, errFallback
		}
		return make([]batchMeasurement, len(rows)), nil
	})
	if got != nil || !errors.Is(err, errFallback) {
		t.Fatalf("partial result %v, error %v", got, err)
	}
}

func TestBootEvidenceRequiresAnUnreadPhysicalRatingAtFinalistPrecision(t *testing.T) {
	for _, rating := range []struct {
		enchant int
		axis    byte
	}{
		{7962, armorAvoidance}, {7963, armorAvoidance}, {7992, armorLeech},
		{7993, armorLeech}, {8018, armorSpeed}, {8019, armorSpeed},
	} {
		physical := []batchCandidate{
			{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 10, EnchantID: rating.enchant}}},
			{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 10, EnchantID: 99999}}},
		}
		for reads := byte(0); reads <= allArmorRatings; reads++ {
			for _, share := range []bool{false, true} {
				rows, err := simulateArmorBatch(physical, share, func(batch []batchCandidate, observed *byte) ([]batchMeasurement, error) {
					if observed != nil {
						*observed = reads
					}
					return make([]batchMeasurement, len(batch)), nil
				})
				want := byte(0)
				if share && reads&rating.axis == 0 {
					want = allArmorRatings &^ reads
				}
				if err != nil || rows[0].EquivalentBootRatings != want || rows[1].EquivalentBootRatings != 0 {
					t.Fatalf("enchant %d, mask %d, share %v: got %+v, error %v", rating.enchant, reads, share, rows, err)
				}
			}
		}
	}
}

func TestArmorBatchKeepsInstancesAndUnsupportedEditsSeparate(t *testing.T) {
	ix := 0
	r := batchCandidate{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: 7962}}}
	for _, other := range []batchCandidate{
		{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 2, EnchantID: 7992}}},
		{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: 7992, Gems: []ownedGemEdit{{Index: &ix, ItemID: 7}}}}},
		{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: 0}}},
		{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: 7993}}},
		{OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: 1, EnchantID: 5555}}},
		{OwnedChanges: r.OwnedChanges, GearChanges: []GearChange{{Slot: "neck", ItemID: 4}}},
	} {
		if armorBatchKey(r, 0) == armorBatchKey(other, 0) {
			t.Fatal("merged unrelated physical changes", other)
		}
	}
}

// The first anchor wears the original trinket. Only the second profileset
// equips Scroll of Momentum and reads movement speed to deal damage.
func TestNativeArmorBatchObservesLaterProfilesets(t *testing.T) {
	binary, fixture := os.Getenv("GILDRA_NATIVE_APL_TEST_BINARY"), os.Getenv("GILDRA_ARMOR_TEST_INPUT")
	if binary == "" || fixture == "" {
		t.Skip("requires pinned SimC and a Fury armory with boots and a trinket")
	}
	raw, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	var input SimulationInput
	if err = json.Unmarshal(raw, &input); err != nil {
		t.Fatal(err)
	}
	if input.Armory == nil || input.Spec != "fury-warrior" {
		t.Fatal("expected Fury armory")
	}
	var equipment struct {
		Items []armoryItem `json:"equipped_items"`
	}
	if err = json.Unmarshal(input.Armory.Equipment, &equipment); err != nil {
		t.Fatal(err)
	}
	worn := map[string]int{}
	for _, item := range equipment.Items {
		worn[item.Slot.Type] = item.Item.ID
	}
	if worn["FEET"] == 0 || worn["TRINKET_1"] == 0 || worn["TRINKET_1"] == 226539 {
		t.Fatal("expected boots and an original trinket")
	}
	input.ActionListMode = ActionListModeNative
	input.Precision = auctionFinalistPrecision
	batch := simulationBatch{Base: input}
	for _, trinket := range []int{worn["TRINKET_1"], 226539} {
		for _, enchant := range []int{7962, 7992, 8018} {
			batch.Candidates = append(batch.Candidates, batchCandidate{GearChanges: []GearChange{{Slot: "trinket1", ItemID: trinket}}, OwnedChanges: []ownedEdit{{SlotType: "FEET", ItemID: worn["FEET"], EnchantID: enchant}}})
		}
	}
	engine, err := NewSimCEngine(binary, "", 750)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	got, err := engine.SimulateBatch(ctx, batch)
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := batch.prepareOwnedCandidates()
	if err != nil {
		t.Fatal(err)
	}
	batch.Candidates = prepared
	var mask byte
	want, err := engine.runPreparedBatch(ctx, batch, &mask)
	if err != nil {
		t.Fatal(err)
	}
	// The movement-speed trinket reads speed on a later profileset. Only
	// avoidance/leech pairs may be substituted even on the earlier packet rows.
	for i := range got {
		observed := got[i].EquivalentBootRatings
		if observed&armorSpeed != 0 || (i == 0 && observed != armorLeech|armorAvoidance) {
			t.Fatalf("row %d advertised unsafe boot ratings %d, union %d", i, observed, mask)
		}
		got[i].EquivalentBootRatings = 0
	}
	if mask&armorSpeed == 0 || mask == allArmorRatings || want[3].DPSMean == want[5].DPSMean || !reflect.DeepEqual(got, want) {
		t.Fatalf("later profileset mask %d, grouped %+v, individual %+v", mask, got, want)
	}
}
