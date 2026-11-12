package itemscaling

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
)

type fixture struct {
	Build string          `json:"build"`
	Rows  []Row           `json:"rows"`
	Items []referenceItem `json:"items"`
}

// writeFixture keeps a spread of reference items and only the table rows
// their levels read. Run TestOfficialValues with ITEMS_FIXTURE_OUT to refresh.
func writeFixture(t *testing.T, path string, tables *Tables, rows []Row, picked []referenceItem) {
	t.Helper()
	// Recent expansions, every slot and every quality first; then fill up.
	sort.SliceStable(picked, func(a, b int) bool {
		era := func(item referenceItem) int { value, _ := strconv.Atoi(item.Sparse["ExpansionID"]); return value }
		return era(picked[a]) > era(picked[b])
	})
	var items []referenceItem
	slots, recent := map[string]int{}, 0
	for _, item := range picked {
		slot := item.Registry["ClassID"] + "/" + item.Sparse["InventoryType"] + "/" + item.Sparse["OverallQualityID"]
		era, _ := strconv.Atoi(item.Sparse["ExpansionID"])
		if slots[slot] >= 1 || (era >= 10 && recent >= 16) || len(items) >= 48 {
			continue
		}
		slots[slot]++
		if era >= 10 {
			recent++
		}
		items = append(items, item)
	}
	levels := map[int64]bool{}
	for _, item := range items {
		levels[int64(item.ItemLevel)] = true
	}
	var kept []Row
	for _, row := range rows {
		switch row.Table {
		case TableArmorLocation, TableSquishEra, TableCurvePoint:
			kept = append(kept, row)
		case TableDefaultBonus, TableEnchantmentRU:
		case TableSpellScaling:
			if row.Key == 1 || row.Key == 27 || row.Key == 50 {
				kept = append(kept, row)
			}
		default:
			if levels[row.Key] {
				kept = append(kept, row)
			}
		}
	}
	encoded, err := json.MarshalIndent(fixture{Build: "12.1.0.69587", Rows: kept, Items: items}, "", " ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("fixture: %d items, %d rows", len(items), len(kept))
}

// TestReferenceItems recomputes a spread of real items from real rows of
// build 12.1.0.69587 and compares them with the official API values.
func TestReferenceItems(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "reference-items.json"))
	if err != nil {
		t.Fatal(err)
	}
	var data fixture
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	tables, err := Parse(data.Rows)
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Items) < 30 {
		t.Fatalf("fixture has %d items", len(data.Items))
	}
	primary := map[int]bool{3: true, 4: true, 5: true, 71: true, 72: true, 73: true, 74: true}
	for _, item := range data.Items {
		source, ok := ItemFromPayloads(func(column string) string { return item.Sparse[column] }, func(column string) string { return item.Registry[column] })
		if !ok {
			t.Fatalf("item %d: source row is incomplete", item.ID)
		}
		numbers, own := tables.Compute(item.ID, source)
		if !own || numbers.ItemLevel != item.ItemLevel || numbers.Armor != item.Armor {
			t.Errorf("item %d %s: level %d armor %d, official level %d armor %d", item.ID, item.Name, numbers.ItemLevel, numbers.Armor, item.ItemLevel, item.Armor)
		}
		if (numbers.Weapon == nil) != (item.Weapon == nil) || (item.Weapon != nil && *numbers.Weapon != *item.Weapon) {
			t.Errorf("item %d %s: weapon %+v, official %+v", item.ID, item.Name, numbers.Weapon, item.Weapon)
		}
		computed, primaryTotal, primaryAny := map[string]int{}, 0, map[int]bool{}
		for _, stat := range numbers.Stats {
			if primary[stat.Type] {
				primaryTotal += stat.Value
				primaryAny[stat.Value] = true
				continue
			}
			computed[strconv.Itoa(stat.Type)] = stat.Value
		}
		for statType, value := range item.Stats {
			if computed[statType] != value {
				t.Errorf("item %d %s: stat %s = %d, official %d", item.ID, item.Name, statType, computed[statType], value)
			}
		}
		if item.Primary != 0 && primaryTotal != item.Primary && !primaryAny[item.Primary] {
			t.Errorf("item %d %s: primary stat %d, official %d", item.ID, item.Name, primaryTotal, item.Primary)
		}
	}
}

func TestNoLevelOfItsOwn(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "reference-items.json"))
	if err != nil {
		t.Fatal(err)
	}
	var data fixture
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	item := data.Items[0]
	source, _ := ItemFromPayloads(func(column string) string { return item.Sparse[column] }, func(column string) string { return item.Registry[column] })
	rows := append([]Row{}, data.Rows...)
	rows = append(rows, Row{Table: TableDefaultBonus, Key: item.ID, Payload: map[string]string{"Mode": bonusModeContext}},
		Row{Table: TableDefaultBonus, Key: item.ID + 1, Payload: map[string]string{"Mode": bonusModeFixed, "ItemLevel": strconv.Itoa(item.ItemLevel), "Quality": "0"}})
	tables, err := Parse(rows)
	if err != nil {
		t.Fatal(err)
	}
	if _, own := tables.Compute(item.ID, source); own {
		t.Fatal("an item whose level is chosen by its drop context must show nothing")
	}
	scaled := source
	scaled.LevelCurve = 1
	if _, own := tables.Compute(0, scaled); own {
		t.Fatal("an item that follows the character level must show nothing")
	}
	// A fixed scaling config gives level, damage and armor, never stat amounts.
	numbers, own := tables.Compute(item.ID+1, source)
	if !own || numbers.ItemLevel != item.ItemLevel || len(numbers.Stats) != 0 {
		t.Fatalf("fixed level: %+v %v", numbers, own)
	}
	if _, err := Parse(data.Rows[:len(data.Rows)/2]); err == nil {
		t.Fatal("an incomplete table set must be refused")
	}
}

func TestEnchantAmount(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "reference-items.json"))
	if err != nil {
		t.Fatal(err)
	}
	var data fixture
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	tables, err := Parse(data.Rows)
	if err != nil {
		t.Fatal(err)
	}
	// Void Sphere (22459): 0.5 x Gem2 at level 27; Brilliant Blood Garnet (23094):
	// 1 x Gem1; Deadly Deep Chemirine-like 1 x Gem3 at level 50 rounds 4.83 up.
	for _, test := range []struct {
		points       float64
		class, level int
		want         int
	}{{0.5, -4, 27, 1}, {1, -3, 27, 1}, {1, -5, 50, 5}} {
		if got, ok := tables.EnchantAmount(test.points, test.class, test.level); !ok || got != test.want {
			t.Errorf("EnchantAmount(%v,%d,%d) = %d %v, want %d", test.points, test.class, test.level, got, ok, test.want)
		}
	}
	for _, class := range []int{8, -7, -1} {
		if _, ok := tables.EnchantAmount(1, class, 27); ok {
			t.Errorf("scaling class %d has no confirmed rule", class)
		}
	}
}
