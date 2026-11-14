package itemscaling

import (
	"bufio"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func csvRows(t testing.TB, path string, consume func(map[string]string)) {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	reader := csv.NewReader(bufio.NewReaderSize(file, 1<<20))
	reader.FieldsPerRecord = -1
	headers, err := reader.Read()
	if err != nil {
		t.Fatal(err)
	}
	headers = append([]string(nil), headers...)
	for {
		values, err := reader.Read()
		if err == io.EOF {
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		row := make(map[string]string, len(headers))
		for index, header := range headers {
			if index < len(values) {
				row[header] = values[index]
			}
		}
		consume(row)
	}
}

// directorySource serves unmodified Wago exports of one build from a folder.
type directorySource struct {
	t   testing.TB
	dir string
}

func (s directorySource) Table(_ context.Context, table, _ string, locale string, consume func(map[string]string) error) (string, []byte, int64, error) {
	name := table + ".csv"
	if locale != "enUS" {
		name = table + "." + locale + ".csv"
	}
	var failure error
	csvRows(s.t, filepath.Join(s.dir, name), func(row map[string]string) {
		if failure == nil {
			failure = consume(row)
		}
	})
	return "file:" + name, make([]byte, 32), 1, failure
}

func (s directorySource) File(_ context.Context, fileDataID int, _ string) (string, []byte, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, fmt.Sprintf("gt-%d.txt", fileDataID)))
	return "file:gametable", data, err
}

func sourceRows(t testing.TB, dir string) []Row {
	t.Helper()
	rows, _, err := Fetch(context.Background(), directorySource{t, dir}, "0.0.0.0")
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

func itemFromSource(sparse, registry map[string]string) Item {
	item, _ := ItemFromPayloads(func(column string) string { return sparse[column] }, func(column string) string { return registry[column] })
	return item
}

// TestOfficialValues compares every item of the build with the values the
// official API returned for it (exported from catalog_verified_item_*). It
// needs the unmodified source exports and is skipped without them.
func TestOfficialValues(t *testing.T) {
	dir, truth := os.Getenv("ITEMS_SOURCE_DIR"), os.Getenv("ITEMS_TRUTH_DIR")
	if dir == "" || truth == "" {
		t.Skip("ITEMS_SOURCE_DIR and ITEMS_TRUTH_DIR are required")
	}
	tables, err := Parse(sourceRows(t, dir))
	if err != nil {
		t.Fatal(err)
	}
	registry := map[string]map[string]string{}
	csvRows(t, filepath.Join(dir, "Item.csv"), func(row map[string]string) { registry[row["ID"]] = row })
	sparse := map[string]map[string]string{}
	csvRows(t, filepath.Join(dir, "ItemSparse.csv"), func(row map[string]string) {
		keep := map[string]string{"Display_lang": row["Display_lang"], "ExpansionID": row["ExpansionID"]}
		for _, column := range SparseColumns {
			keep[column] = row[column]
		}
		sparse[row["ID"]] = keep
	})
	trees := map[string]bool{}
	csvRows(t, filepath.Join(dir, "ItemXBonusTree.csv"), func(row map[string]string) { trees[row["ItemID"]] = true })

	officialStats := map[string]map[string]int{}
	lines := func(name string, consume func([]string)) {
		file, err := os.Open(filepath.Join(truth, name))
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			consume(strings.Split(scanner.Text(), "\t"))
		}
	}
	lines("stats.tsv", func(fields []string) {
		if fields[1] != "180" {
			return
		}
		value, _ := strconv.ParseFloat(fields[3], 64)
		if officialStats[fields[0]] == nil {
			officialStats[fields[0]] = map[string]int{}
		}
		officialStats[fields[0]][fields[2]] = int(value)
	})
	keys := map[string]int{"STAMINA": 7, "CRIT_RATING": 32, "HASTE_RATING": 36, "VERSATILITY": 40, "MASTERY_RATING": 49,
		"DODGE_RATING": 13, "PARRY_RATING": 14, "COMBAT_RATING_LIFESTEAL": 62, "COMBAT_RATING_SPEED": 61,
		"COMBAT_RATING_AVOIDANCE": 63, "COMBAT_RATING_STURDINESS": 64}
	primary := map[int]bool{3: true, 4: true, 5: true, 71: true, 72: true, 73: true, 74: true}
	counts := map[string]int{}
	picked, buckets := []referenceItem{}, map[string]bool{}
	lines("details.tsv", func(fields []string) {
		id := fields[0]
		if fields[1] != "180" || fields[2] == `\N` || sparse[id] == nil || registry[id] == nil {
			return
		}
		item := itemFromSource(sparse[id], registry[id])
		number, _ := strconv.ParseInt(id, 10, 64)
		numbers, fixed := tables.Compute(number, item)
		if !fixed {
			counts["no level of its own, nothing shown"]++
			return
		}
		prefix := ""
		if _, scaled := tables.defaults[number]; scaled {
			prefix = "scaling config: "
		}
		official, _ := strconv.Atoi(fields[2])
		if numbers.ItemLevel != official {
			// The API preview applied the item's default bonus tree.
			if prefix != "" {
				counts[prefix+"level differs"]++
				t.Errorf("item %s scaling config level: official %d, computed %d", id, official, numbers.ItemLevel)
			} else if trees[id] {
				counts["level differs, default bonus tree"]++
			} else {
				counts["level differs, no bonus tree"]++
				t.Logf("item %s without a bonus tree: official level %d, computed %d", id, official, numbers.ItemLevel)
			}
			return
		}
		counts[prefix+"level equal"]++
		if fields[3] != `\N` {
			low, _ := strconv.ParseFloat(fields[3], 64)
			high, _ := strconv.ParseFloat(fields[4], 64)
			speed, _ := strconv.ParseFloat(fields[5], 64)
			dps, _ := strconv.ParseFloat(fields[6], 64)
			switch weapon := numbers.Weapon; {
			case weapon == nil:
				counts[prefix+"weapon not computed"]++
			case float64(weapon.Min) == low && float64(weapon.Max) == high && abs(weapon.Speed-speed) < 1e-6 && abs(weapon.DPS-dps) < 1e-3:
				counts[prefix+"weapon equal"]++
			default:
				counts[prefix+"weapon differs"]++
				t.Errorf("item %s weapon: official %v, computed %+v", id, fields[3:7], *weapon)
			}
		}
		if fields[7] != `\N` {
			armor, _ := strconv.Atoi(fields[7])
			if numbers.Armor == armor {
				counts[prefix+"armor equal"]++
			} else {
				counts[prefix+"armor differs"]++
				t.Errorf("item %s armor: official %d, computed %d", id, armor, numbers.Armor)
			}
		}
		if prefix != "" {
			return
		}
		// The API export keeps one row for the primary stat: either the only
		// primary slot or, for two slots of one attribute, their sum.
		computed, primaryTotal, primaryAny := map[int]int{}, 0, map[int]bool{}
		for _, stat := range numbers.Stats {
			computed[stat.Type] = stat.Value
			if primary[stat.Type] {
				primaryTotal += stat.Value
				primaryAny[stat.Value] = true
			}
		}
		for key, value := range officialStats[id] {
			statType, known := keys[key]
			switch {
			case known:
				got, present := computed[statType]
				switch {
				case !present:
					counts["stat granted by a bonus, not by the item row"]++
				case got == value:
					counts["stat equal"]++
				default:
					counts["stat differs"]++
					t.Logf("item %s %s: official %d, computed %d", id, key, value, got)
				}
			case key == "INTELLECT" || key == "STRENGTH" || key == "AGILITY":
				if primaryTotal == value || primaryAny[value] {
					counts["primary stat equal"]++
				} else {
					counts["primary stat differs"]++
					t.Errorf("item %s %s: official %d, computed %d", id, key, value, primaryTotal)
				}
			}
		}
		// One fully agreeing item per slot, quality and era for the committed fixture.
		if prefix != "" {
			return
		}
		reference := referenceItem{ID: number, Name: sparse[id]["Display_lang"], Sparse: map[string]string{}, Registry: map[string]string{
			"ClassID": registry[id]["ClassID"], "SubclassID": registry[id]["SubclassID"]}, ItemLevel: official, Stats: map[string]int{}}
		for _, column := range SparseColumns {
			reference.Sparse[column] = sparse[id][column]
		}
		reference.Sparse["ExpansionID"] = sparse[id]["ExpansionID"]
		complete := true
		for key, value := range officialStats[id] {
			statType, known := keys[key]
			if known && computed[statType] == value {
				reference.Stats[strconv.Itoa(statType)] = value
			} else if !known && (key == "INTELLECT" || key == "STRENGTH" || key == "AGILITY") {
				reference.Primary = value
			} else {
				complete = false
			}
		}
		if fields[3] != `\N` && numbers.Weapon != nil {
			reference.Weapon = &Weapon{Min: numbers.Weapon.Min, Max: numbers.Weapon.Max, Speed: numbers.Weapon.Speed, DPS: numbers.Weapon.DPS}
			reference.OfficialDamage = strings.Join(fields[3:7], " ")
		}
		if fields[7] != `\N` {
			reference.Armor, _ = strconv.Atoi(fields[7])
		}
		if !complete || (reference.Weapon == nil && reference.Armor == 0 && len(reference.Stats) == 0) {
			return
		}
		bucket := registry[id]["ClassID"] + "/" + sparse[id]["InventoryType"] + "/" + sparse[id]["OverallQualityID"] + "/" + sparse[id]["ExpansionID"]
		if !buckets[bucket] {
			buckets[bucket] = true
			picked = append(picked, reference)
		}
	})
	for _, key := range []string{"no level of its own, nothing shown", "scaling config: level equal", "scaling config: level differs",
		"scaling config: weapon equal", "scaling config: weapon differs", "scaling config: weapon not computed",
		"scaling config: armor equal", "scaling config: armor differs", "level equal", "level differs, default bonus tree", "level differs, no bonus tree",
		"weapon equal", "weapon differs", "weapon not computed", "armor equal", "armor differs", "stat equal",
		"stat differs", "stat granted by a bonus, not by the item row", "primary stat equal", "primary stat differs"} {
		t.Logf("%-48s %d", key, counts[key])
	}
	if out := os.Getenv("ITEMS_FIXTURE_OUT"); out != "" {
		writeFixture(t, out, tables, sourceRows(t, dir), picked)
	}
	// One item changed its squish era and one its stats between the build of
	// the tables (12.1.0.69587) and the build the API answered for (12.1.5.70077).
	if counts["level differs, no bonus tree"] > 1 || counts["stat differs"] > 1 {
		t.Errorf("unexplained differences: level %d, stat %d", counts["level differs, no bonus tree"], counts["stat differs"])
	}
}

// referenceItem is one item of the committed fixture: its source row and the
// values the official API returned for it.
type referenceItem struct {
	ID             int64             `json:"id"`
	Name           string            `json:"name"`
	Sparse         map[string]string `json:"sparse"`
	Registry       map[string]string `json:"registry"`
	ItemLevel      int               `json:"item_level"`
	Weapon         *Weapon           `json:"weapon,omitempty"`
	OfficialDamage string            `json:"official_damage,omitempty"`
	Armor          int               `json:"armor,omitempty"`
	Primary        int               `json:"primary,omitempty"`
	Stats          map[string]int    `json:"stats,omitempty"`
}

func abs(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}
