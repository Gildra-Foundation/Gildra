// Package itemscaling computes the numbers the game client prints on an item
// tooltip (item level, weapon damage, armor, stat amounts, scaled enchant
// amounts) from the client tables of one build. Nothing here is estimated:
// when a table row needed by a formula is absent the value is left out.
package itemscaling

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Row is one source row of a reference table, keyed the way the client looks
// it up (item level, inventory type, era or point id).
type Row struct {
	Table   string
	Key     int64
	Payload map[string]string
}

// Reference table names as stored. Game tables keep the client file name.
const (
	TableRandPropPoints      = "RandPropPoints"
	TableDamageAmmo          = "ItemDamageAmmo"
	TableDamageOneHand       = "ItemDamageOneHand"
	TableDamageOneHandCaster = "ItemDamageOneHandCaster"
	TableDamageTwoHand       = "ItemDamageTwoHand"
	TableDamageTwoHandCaster = "ItemDamageTwoHandCaster"
	TableArmorQuality        = "ItemArmorQuality"
	TableArmorTotal          = "ItemArmorTotal"
	TableArmorShield         = "ItemArmorShield"
	TableArmorLocation       = "ArmorLocation"
	TableSquishEra           = "ItemSquishEra"
	TableCurvePoint          = "CurvePoint"
	TableCombatRatingsMult   = "CombatRatingsMultByILvl"
	TableStaminaMult         = "StaminaMultByILvl"
	TableSocketCost          = "ItemSocketCostPerLevel"
	TableSpellScaling        = "SpellScaling"
	TableEnchantmentRU       = "SpellItemEnchantment_ruRU"
	// TableDefaultBonus is derived from ItemXBonusTree, ItemBonusTreeNode,
	// ItemBonus, ItemScalingConfig and ItemOffsetCurve: one row per item whose
	// default bonus context changes its level.
	TableDefaultBonus = "ItemDefaultBonus"
)

// RequiredTables must all be present for a build before any number is shown.
var RequiredTables = []string{
	TableRandPropPoints, TableDamageAmmo, TableDamageOneHand, TableDamageOneHandCaster,
	TableDamageTwoHand, TableDamageTwoHandCaster, TableArmorQuality, TableArmorTotal,
	TableArmorShield, TableArmorLocation, TableSquishEra, TableCurvePoint,
	TableCombatRatingsMult, TableStaminaMult, TableSocketCost, TableSpellScaling,
}

type curvePoint struct{ x, y float64 }

type squishEra struct {
	id     int
	points []curvePoint
}

// Tables is the parsed, read-only reference data of one build.
type Tables struct {
	randProp      map[int][3][5]float64 // item level -> epic, superior, good -> slot group
	damage        map[string]map[int][7]float64
	armorQuality  map[int][7]float64
	armorTotal    map[int][4]float64 // cloth, leather, mail, plate
	armorShield   map[int][7]float64
	armorLocation map[int][4]float64
	ratingMult    map[int][4]float64 // armor, weapon, trinket, jewelry
	staminaMult   map[int][4]float64
	socketCost    map[int]float64
	spellScaling  map[int]map[string]float64
	scalingMax    int
	eras          []squishEra
	enchantRU     map[int64]string
	defaults      map[int64]defaultBonus
}

// EnchantmentNameRU returns the Russian SpellItemEnchantment text of the build.
func (t *Tables) EnchantmentNameRU(id int64) string {
	if t == nil {
		return ""
	}
	return t.enchantRU[id]
}

func number(payload map[string]string, column string) (float64, error) {
	raw, ok := payload[column]
	if !ok {
		return 0, fmt.Errorf("column %s is missing", column)
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("column %s is not a number: %q", column, raw)
	}
	return value, nil
}

func series(payload map[string]string, prefix string, out []float64) error {
	for index := range out {
		value, err := number(payload, prefix+strconv.Itoa(index))
		if err != nil {
			return err
		}
		out[index] = value
	}
	return nil
}

func columns(payload map[string]string, names []string, out []float64) error {
	for index, name := range names {
		value, err := number(payload, name)
		if err != nil {
			return err
		}
		out[index] = value
	}
	return nil
}

var multiplierColumns = []string{"Armor Multiplier", "Weapon Multiplier", "Trinket Multiplier", "Jewelry Multiplier"}

// Parse builds Tables from stored rows and refuses an incomplete set, so a
// partially imported build shows nothing instead of numbers from half a formula.
func Parse(rows []Row) (*Tables, error) {
	t := &Tables{
		randProp: map[int][3][5]float64{}, damage: map[string]map[int][7]float64{},
		armorQuality: map[int][7]float64{}, armorTotal: map[int][4]float64{}, armorShield: map[int][7]float64{},
		armorLocation: map[int][4]float64{}, ratingMult: map[int][4]float64{}, staminaMult: map[int][4]float64{},
		socketCost: map[int]float64{}, spellScaling: map[int]map[string]float64{}, enchantRU: map[int64]string{},
		defaults: map[int64]defaultBonus{},
	}
	seen := map[string]int{}
	type eraRow struct{ id, curve int }
	var eras []eraRow
	type pointRow struct {
		curve, order int
		point        curvePoint
	}
	var points []pointRow
	for _, row := range rows {
		seen[row.Table]++
		key := int(row.Key)
		var err error
		switch row.Table {
		case TableRandPropPoints:
			var value [3][5]float64
			for group, prefix := range []string{"EpicF_", "SuperiorF_", "GoodF_"} {
				if err = series(row.Payload, prefix, value[group][:]); err != nil {
					break
				}
			}
			t.randProp[key] = value
		case TableDamageAmmo, TableDamageOneHand, TableDamageOneHandCaster, TableDamageTwoHand, TableDamageTwoHandCaster:
			var value [7]float64
			err = series(row.Payload, "Quality_", value[:])
			if t.damage[row.Table] == nil {
				t.damage[row.Table] = map[int][7]float64{}
			}
			t.damage[row.Table][key] = value
		case TableArmorQuality:
			var value [7]float64
			err = series(row.Payload, "Qualitymod_", value[:])
			t.armorQuality[key] = value
		case TableArmorShield:
			var value [7]float64
			err = series(row.Payload, "Quality_", value[:])
			t.armorShield[key] = value
		case TableArmorTotal:
			var value [4]float64
			err = columns(row.Payload, []string{"Cloth", "Leather", "Mail", "Plate"}, value[:])
			t.armorTotal[key] = value
		case TableArmorLocation:
			var value [4]float64
			err = columns(row.Payload, []string{"Clothmodifier", "Leathermodifier", "Chainmodifier", "Platemodifier"}, value[:])
			t.armorLocation[key] = value
		case TableCombatRatingsMult:
			var value [4]float64
			err = columns(row.Payload, multiplierColumns, value[:])
			t.ratingMult[key] = value
		case TableStaminaMult:
			var value [4]float64
			err = columns(row.Payload, multiplierColumns, value[:])
			t.staminaMult[key] = value
		case TableSocketCost:
			t.socketCost[key], err = number(row.Payload, "Socket Cost")
		case TableSpellScaling:
			value := map[string]float64{}
			for column := range row.Payload {
				if value[column], err = number(row.Payload, column); err != nil {
					break
				}
			}
			t.spellScaling[key] = value
			if key > t.scalingMax {
				t.scalingMax = key
			}
		case TableSquishEra:
			var curve float64
			curve, err = number(row.Payload, "CurveID")
			eras = append(eras, eraRow{id: key, curve: int(curve)})
		case TableCurvePoint:
			var curve, order, x, y float64
			if curve, err = number(row.Payload, "CurveID"); err == nil {
				if order, err = number(row.Payload, "OrderIndex"); err == nil {
					if x, err = number(row.Payload, "Pos_0"); err == nil {
						y, err = number(row.Payload, "Pos_1")
					}
				}
			}
			points = append(points, pointRow{curve: int(curve), order: int(order), point: curvePoint{x, y}})
		case TableDefaultBonus:
			entry := defaultBonus{mode: row.Payload["Mode"]}
			if entry.mode == bonusModeFixed {
				var level, quality float64
				if level, err = number(row.Payload, "ItemLevel"); err == nil {
					quality, err = number(row.Payload, "Quality")
				}
				entry.level, entry.quality = int(level), int(quality)
			}
			t.defaults[row.Key] = entry
		case TableEnchantmentRU:
			if name := row.Payload["Name_lang"]; name != "" {
				t.enchantRU[row.Key] = name
			}
		}
		if err != nil {
			return nil, fmt.Errorf("%s row %d: %w", row.Table, row.Key, err)
		}
	}
	for _, table := range RequiredTables {
		if seen[table] == 0 {
			return nil, fmt.Errorf("reference table %s has no rows", table)
		}
	}
	sort.Slice(points, func(a, b int) bool {
		if points[a].curve != points[b].curve {
			return points[a].curve < points[b].curve
		}
		return points[a].order < points[b].order
	})
	sort.Slice(eras, func(a, b int) bool { return eras[a].id < eras[b].id })
	for _, era := range eras {
		entry := squishEra{id: era.id}
		for _, point := range points {
			if era.curve != 0 && point.curve == era.curve {
				entry.points = append(entry.points, point.point)
			}
		}
		if era.curve != 0 && len(entry.points) == 0 {
			return nil, fmt.Errorf("item squish era %d: curve %d has no points", era.id, era.curve)
		}
		t.eras = append(t.eras, entry)
	}
	return t, nil
}

// Curve type 0: straight segments between points, flat outside them.
func evaluate(points []curvePoint, x float64) float64 {
	if x <= points[0].x {
		return points[0].y
	}
	for index := 1; index < len(points); index++ {
		previous, next := points[index-1], points[index]
		if x <= next.x {
			if next.x == previous.x {
				return next.y
			}
			return previous.y + (x-previous.x)*(next.y-previous.y)/(next.x-previous.x)
		}
	}
	return points[len(points)-1].y
}

// ItemLevel converts the stored ItemSparse level to the level the current
// client shows: every squish era newer than the item's own era is applied.
func (t *Tables) ItemLevel(stored, era int) int {
	level := stored
	for _, entry := range t.eras {
		if entry.id > era && len(entry.points) > 0 {
			level = int(math.Floor(evaluate(entry.points, float64(level)) + 0.5))
		}
	}
	return level
}
