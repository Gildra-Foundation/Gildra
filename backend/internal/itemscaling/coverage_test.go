package itemscaling

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// TestPublishedCoverage counts, over the published items of the build, how
// many get numbers and why the others do not. It needs the source exports and
// a list of published item ids ("id<TAB>usability decision").
func TestPublishedCoverage(t *testing.T) {
	dir, published := os.Getenv("ITEMS_SOURCE_DIR"), os.Getenv("ITEMS_PUBLISHED")
	if dir == "" || published == "" {
		t.Skip("ITEMS_SOURCE_DIR and ITEMS_PUBLISHED are required")
	}
	tables, err := Parse(sourceRows(t, dir))
	if err != nil {
		t.Fatal(err)
	}
	decisions := map[string]string{}
	file, err := os.Open(published)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		decisions[fields[0]] = fields[len(fields)-1]
	}
	registry := map[string]map[string]string{}
	csvRows(t, filepath.Join(dir, "Item.csv"), func(row map[string]string) { registry[row["ID"]] = row })
	gems := map[string]string{}
	csvRows(t, filepath.Join(dir, "GemProperties.csv"), func(row map[string]string) { gems[row["ID"]] = row["Enchant_ID"] })
	enchants := map[string]map[string]string{}
	csvRows(t, filepath.Join(dir, "SpellItemEnchantment.csv"), func(row map[string]string) { enchants[row["ID"]] = row })
	counts := map[string]map[string]int{}
	add := func(class, key string) {
		if counts[class] == nil {
			counts[class] = map[string]int{}
		}
		counts[class][key]++
	}
	csvRows(t, filepath.Join(dir, "ItemSparse.csv"), func(sparse map[string]string) {
		id := sparse["ID"]
		decision, ok := decisions[id]
		if !ok || registry[id] == nil {
			return
		}
		classID, _ := strconv.Atoi(registry[id]["ClassID"])
		inventory, _ := strconv.Atoi(sparse["InventoryType"])
		class := ""
		switch {
		case classID == 2:
			class = "weapons"
		case classID == 4 && (inventory == 2 || inventory == 11 || inventory == 12):
			class = "jewellery"
		case classID == 4 && inventory != 0:
			class = "armor"
		case classID == 3:
			class = "gems"
		case classID == 8:
			class = "enchants"
		case classID == 0:
			class = "consumables"
		default:
			return
		}
		for _, scope := range []string{"published", decision} {
			if scope == "" {
				continue
			}
			group := class + " / " + scope
			add(group, "total")
			if class == "gems" {
				enchant := enchants[gems[sparse["Gem_properties"]]]
				switch {
				case enchant == nil:
					add(group, "no socket enchantment in source")
				case !strings.Contains(enchant["Name_lang"], "$k"):
					add(group, "socket effect is plain text")
				default:
					resolved := true
					for slot := 0; slot < 3; slot++ {
						index := strconv.Itoa(slot)
						if enchant["Effect_"+index] != "5" {
							continue
						}
						class, _ := strconv.Atoi(enchant["ScalingClass"])
						points, _ := strconv.ParseFloat(enchant["EffectScalingPoints_"+index], 64)
						level, _ := strconv.Atoi(enchant["MaxLevel"])
						if class == 0 && points == 0 {
							continue
						}
						if _, ok := tables.EnchantAmount(points, class, level); !ok {
							resolved = false
						}
					}
					if resolved {
						add(group, "socket effect with amounts")
					} else {
						add(group, "socket effect scaling not confirmed: no text")
					}
				}
				continue
			}
			if class == "enchants" || class == "consumables" {
				continue
			}
			item, ok := ItemFromPayloads(func(column string) string { return sparse[column] }, func(column string) string { return registry[id][column] })
			if !ok {
				add(group, "source row incomplete")
				continue
			}
			number, _ := strconv.ParseInt(id, 10, 64)
			numbers, own := tables.Compute(number, item)
			if !own {
				if item.LevelCurve != 0 {
					add(group, "nothing: level follows the character level")
				} else {
					add(group, "nothing: level set by the drop context")
				}
				continue
			}
			any := false
			if numbers.Weapon != nil {
				add(group, "damage, speed and DPS")
				any = true
			}
			if numbers.Armor > 0 {
				add(group, "armor")
				any = true
			}
			if len(numbers.Stats) > 0 {
				add(group, "stat amounts")
				any = true
			}
			if any {
				add(group, "any number")
			} else if _, fixed := tables.defaults[number]; fixed {
				add(group, "nothing: fixed scaling level, no armor or damage row")
			} else {
				add(group, "nothing: the item has no stats, armor or damage")
			}
		}
	})
	groups := make([]string, 0, len(counts))
	for group := range counts {
		groups = append(groups, group)
	}
	sort.Strings(groups)
	for _, group := range groups {
		keys := make([]string, 0, len(counts[group]))
		for key := range counts[group] {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		total := counts[group]["total"]
		for _, key := range keys {
			fmt.Printf("%-24s %-58s %7d %5.1f%%\n", group, key, counts[group][key], 100*float64(counts[group][key])/float64(total))
		}
	}
}
