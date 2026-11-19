package rotationlab

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Slot zero's bonuses belong to the original stone. Editing slot one must
// preserve them, the permanent enchant, the special addon and both crafted stats.
func TestOwnedBatchPreservesImportedItem(t *testing.T) {
	var item armoryItem
	if err := json.Unmarshal([]byte(`{"slot":{"type":"FINGER_1"},"item":{"id":240949},
		"bonus_list":[6652,13668],"timewalker_level":90,"modified_crafting_stat":[{"id":36},{"id":49}],
		"sockets":[{"socket_type":{"type":"PRISMATIC"},"item":{"id":240900},"bonus_list":[11,12]},
			{"socket_type":{"type":"PRISMATIC"},"item":{"id":240898},"bonus_list":[14]}],
		"enchantments":[{"enchantment_slot":{"id":0},"enchantment_id":8025},{"enchantment_slot":{"id":7},"enchantment_id":17}]}`), &item); err != nil {
		t.Fatal(err)
	}
	index := 1
	edit := ownedEdit{SlotType: "FINGER_1", ItemID: 240949, Gems: []ownedGemEdit{{Index: &index, ItemID: 240869}}}
	line, err := item.editedGearLine("finger1", edit)
	want := "finger1=,id=240949,source=local,drop_level=90,crafted_stats=36/49,bonus_id=6652/13668,enchant_id=8025,gem_id=240900/240869,gem_bonus_id=11:12/0,addon_id=17"
	if err != nil || line != want {
		t.Fatal(line, err)
	}
	if item.Sockets[1].Item.ID != 240898 {
		t.Fatal("mutated shared equipment")
	}
	edit.EnchantID = 8026
	edit.Gems = nil
	line, err = item.editedGearLine("finger1", edit)
	if err != nil || !strings.Contains(line, "enchant_id=8026,gem_id=240900/240898,gem_bonus_id=11:12/14,addon_id=17") {
		t.Fatal(line, err)
	}
}

func TestOwnedBatchHandlerAndFallback(t *testing.T) {
	engine, _ := admissionTestEngine(t)
	script := `#!/bin/sh
set -eu
printf '%s\n' "$@" > args
grep -Fqx 'head=,id=271456,source=local,enchant_id=7' args
grep -Fqx 'profileset.c1+=head=,id=271456,source=local,enchant_id=8' args
grep -Fqx 'profileset.c2+=head=,id=271456,source=local,enchant_id=9' args
cat > report.json <<'REPORT'
` + batchReportFixture + "\nREPORT\n"
	if err := os.WriteFile(engine.binary, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	b := simulationBatch{Base: nativeGearInput(t)}
	b.Base.Precision = auctionCandidatePrecision
	b.Base.Armory.Equipment = json.RawMessage(`{"equipped_items":[{"slot":{"type":"HEAD"},"item":{"id":271456}}]}`)
	for _, id := range []int{7, 8, 9} {
		b.Candidates = append(b.Candidates, batchCandidate{OwnedChanges: []ownedEdit{{SlotType: "HEAD", ItemID: 271456, EnchantID: id}}})
	}
	mux := http.NewServeMux()
	NewWorkerHandler(engine).Register(mux)
	send := func() *httptest.ResponseRecorder {
		body, err := json.Marshal(b)
		if err != nil {
			t.Fatal(err)
		}
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations/batch", bytes.NewReader(body)))
		return res
	}
	res := send()
	if res.Code != 201 || res.Header().Get("X-Gildra-Simulation-Owned-Batch") != "1" {
		t.Fatal(res.Code, res.Body.String())
	}
	b.Base.Armory.Equipment = json.RawMessage(`{"equipped_items":[{"slot":{"type":"HEAD"},"item":{"id":271456},"azerite_details":{}}]}`)
	res = send()
	if res.Code != 422 || !strings.Contains(res.Body.String(), `"code":"unsupported_owned_batch"`) {
		t.Fatal(res.Code, res.Body.String())
	}
	for i := range b.Candidates {
		b.Candidates[i].GearChanges = []GearChange{{Slot: "head", ItemID: 123}}
	}
	if _, err := engine.SimulateBatch(context.Background(), b); !errors.Is(err, errInvalidSimulationBatch) {
		t.Fatal(err)
	}
}
