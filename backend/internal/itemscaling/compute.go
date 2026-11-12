package itemscaling

import "math"

// StatSlot is one ItemSparse stat slot: StatModifier_bonusStat, StatPercentEditor
// and StatPercentageOfSocket.
type StatSlot struct {
	Type       int
	Allocation float64
	SocketCost float64
}

// Item carries the ItemSparse and Item fields the formulas read.
type Item struct {
	ClassID        int
	SubclassID     int
	InventoryType  int
	Quality        int
	ItemLevel      int // ItemSparse.ItemLevel as stored
	SquishEra      int // ItemSparse.ItemSquishEraID
	LevelCurve     int // ItemSparse.PlayerLevelToItemLevelCurveID
	Flags1         int64
	DelayMS        int
	DamageVariance float64
	Stats          [10]StatSlot
}

type Stat struct {
	Type  int `json:"stat_type"`
	Value int `json:"value"`
}

type Weapon struct {
	Min   int
	Max   int
	Speed float64
	DPS   float64
}

// Numbers is what the tooltip prints for an item without bonus lists.
type Numbers struct {
	ItemLevel int
	Stats     []Stat
	Weapon    *Weapon
	Armor     int
}

const (
	classWeapon = 2
	classArmor  = 4

	statStamina = 7

	flagCasterWeapon = 0x200 // Flags_1
)

// Inventory types.
const (
	invHead = 1 + iota
	invNeck
	invShoulders
	invBody
	invChest
	invWaist
	invLegs
	invFeet
	invWrists
	invHands
	invFinger
	invTrinket
	invWeapon
	invShield
	invRanged
	invCloak
	invTwoHand
	invBag
	invTabard
	invRobe
	invMainHand
	invOffHand
	invHoldable
	invAmmo
	invThrown
	invRangedRight
)

// Stat budget group of RandPropPoints for an equipment slot; -1 has no budget.
func budgetGroup(item Item) int {
	switch item.InventoryType {
	case invHead, invBody, invChest, invLegs, invRanged, invTwoHand, invRobe, invThrown:
		return 0
	case invRangedRight:
		if item.SubclassID == 19 { // wand
			return 3
		}
		return 0
	case invWeapon, invMainHand, invOffHand, invShield, invHoldable:
		return 3
	case invShoulders, invWaist, invFeet, invHands, invTrinket:
		return 1
	case invNeck, invWrists, invFinger, invCloak:
		return 2
	}
	return -1
}

// Column of the per-item-level multiplier tables; -1 leaves the stat unscaled.
func multiplierColumn(inventoryType int) int {
	switch inventoryType {
	case invNeck, invFinger:
		return 3
	case invTrinket:
		return 2
	case invWeapon, invTwoHand, invMainHand, invOffHand, invRanged, invRangedRight, invThrown:
		return 1
	case invRobe, invHead, invShoulders, invChest, invCloak, invBody, invWrists, invWaist, invLegs,
		invFeet, invShield, invHoldable, invHands:
		return 0
	}
	return -1
}

// Combat ratings are scaled by CombatRatingsMultByILvl; attributes are not.
func combatRating(statType int) bool {
	switch {
	case statType >= 13 && statType <= 37, statType == 40, statType == 49, statType == 57, statType == 59,
		statType >= 61 && statType <= 64:
		return true
	}
	return false
}

// Stat types whose amounts were compared with the official values. Random
// secondary placeholders (24, 25), resistances and profession stats are not
// printed: their amounts are not confirmed.
func shownStat(statType int) bool {
	switch statType {
	case 3, 4, 5, 7, 13, 14, 32, 36, 40, 49, 61, 62, 63, 64, 71, 72, 73, 74:
		return true
	}
	return false
}

func budgetQuality(quality int) int {
	switch quality {
	case 4, 5, 6:
		return 0
	case 3, 7:
		return 1
	case 2:
		return 2
	}
	return -1
}

// Heirlooms read the damage and armor tables as rare items.
func tableQuality(quality int) int {
	if quality == 7 {
		return 3
	}
	return quality
}

func single(value float64) float64 { return float64(float32(value)) }

// Compute returns the numbers of an item as it exists without a drop context.
// Parts whose table row is missing stay empty. It reports false, and nothing
// is shown, when the item has no level of its own: the level follows the
// character level or is chosen by the context the item is created in.
func (t *Tables) Compute(id int64, item Item) (Numbers, bool) {
	if item.LevelCurve != 0 {
		return Numbers{}, false
	}
	bonus, changed := t.defaults[id]
	if changed && bonus.mode != bonusModeFixed {
		return Numbers{}, false
	}
	if changed {
		// A scaling config fixes the level; the stat budget of such items is
		// not reproduced exactly by the plain formula, so amounts are left out.
		if bonus.quality > 0 {
			item.Quality = bonus.quality
		}
		numbers := Numbers{ItemLevel: bonus.level}
		numbers.Weapon = t.weapon(item, bonus.level)
		numbers.Armor = t.armor(item, bonus.level)
		return numbers, true
	}
	level := t.ItemLevel(item.ItemLevel, item.SquishEra)
	numbers := Numbers{ItemLevel: level}
	numbers.Stats = t.stats(item, level)
	numbers.Weapon = t.weapon(item, level)
	numbers.Armor = t.armor(item, level)
	return numbers, true
}

func (t *Tables) stats(item Item, level int) []Stat {
	group, quality := budgetGroup(item), budgetQuality(item.Quality)
	budgets, ok := t.randProp[level]
	if group < 0 || quality < 0 || !ok || budgets[quality][group] <= 0 {
		return nil
	}
	budget := budgets[quality][group]
	socketCost, column := t.socketCost[level], multiplierColumn(item.InventoryType)
	var stats []Stat
	for _, slot := range item.Stats {
		if !shownStat(slot.Type) || slot.Allocation == 0 {
			continue
		}
		raw := slot.Allocation*budget*0.0001 - slot.SocketCost*socketCost
		if column >= 0 {
			if multipliers, ok := t.ratingMult[level]; ok && combatRating(slot.Type) {
				raw *= multipliers[column]
			} else if multipliers, ok := t.staminaMult[level]; ok && slot.Type == statStamina {
				raw *= multipliers[column]
			}
		}
		value := int(math.Floor(raw + 0.5))
		if value <= 0 {
			continue
		}
		merged := false
		for index := range stats {
			if stats[index].Type == slot.Type {
				stats[index].Value += value
				merged = true
			}
		}
		if !merged {
			stats = append(stats, Stat{Type: slot.Type, Value: value})
		}
	}
	return stats
}

func (t *Tables) weapon(item Item, level int) *Weapon {
	quality := tableQuality(item.Quality)
	if item.ClassID != classWeapon || quality < 0 || quality > 6 || item.DelayMS <= 0 {
		return nil
	}
	caster := item.Flags1&flagCasterWeapon != 0
	table := ""
	switch item.InventoryType {
	case invAmmo:
		table = TableDamageAmmo
	case invTwoHand:
		table = TableDamageTwoHand
		if caster {
			table = TableDamageTwoHandCaster
		}
	case invRanged, invThrown, invRangedRight:
		switch item.SubclassID {
		case 19: // wand
			table = TableDamageOneHandCaster
		case 2, 3, 18: // bow, gun, crossbow
			table = TableDamageTwoHand
			if caster {
				table = TableDamageTwoHandCaster
			}
		}
	case invWeapon, invMainHand, invOffHand:
		table = TableDamageOneHand
		if caster {
			table = TableDamageOneHandCaster
		}
	}
	row, ok := t.damage[table][level]
	if !ok || row[quality] <= 0 {
		return nil
	}
	// The client keeps these as 32-bit floats; the order of operations and the
	// narrowing decide the last unit of low-level weapons.
	average := single(single(row[quality]) * float64(item.DelayMS) * single(0.001))
	low := int(math.Floor(single(item.DamageVariance*-0.5+1) * average))
	high := int(math.Floor(average*(item.DamageVariance*0.5+1) + 0.5))
	if low < 1 {
		low = 1
	}
	if high < 1 {
		high = 1
	}
	speed := float64(item.DelayMS) / 1000
	return &Weapon{Min: low, Max: high, Speed: speed, DPS: float64(low+high) / 2 / speed}
}

func (t *Tables) armor(item Item, level int) int {
	quality := tableQuality(item.Quality)
	if item.ClassID != classArmor || quality < 0 || quality > 6 {
		return 0
	}
	if item.SubclassID == 6 { // shield
		row, ok := t.armorShield[level]
		if !ok {
			return 0
		}
		return int(row[quality] + 0.5)
	}
	if item.SubclassID < 1 || item.SubclassID > 4 {
		return 0
	}
	inventoryType := item.InventoryType
	if inventoryType == invRobe {
		inventoryType = invChest
	}
	qualities, okQuality := t.armorQuality[level]
	totals, okTotal := t.armorTotal[level]
	location, okLocation := t.armorLocation[inventoryType]
	if !okQuality || !okTotal || !okLocation {
		return 0
	}
	material := item.SubclassID - 1
	return int(single(single(qualities[quality])*single(totals[material]))*single(location[material]) + 0.5)
}

// Gem scaling classes of SpellItemEnchantment.ScalingClass and their columns
// of the SpellScaling game table.
var scalingColumns = map[int]string{-3: "Gem1", -4: "Gem2", -5: "Gem3"}

// EnchantAmount returns the amount of a scaled SpellItemEnchantment stat for a
// character at or above the enchantment's MaxLevel, which is what a tooltip
// shows at the level cap: ScalingPoints x SpellScaling[MaxLevel], rounded.
// Only the gem classes are answered; the amounts of the other classes were
// not reproduced against in-game tooltips.
func (t *Tables) EnchantAmount(scalingPoints float64, scalingClass, maxLevel int) (int, bool) {
	column, ok := scalingColumns[scalingClass]
	if !ok || scalingPoints <= 0 {
		return 0, false
	}
	level := maxLevel
	if level <= 0 || level > t.scalingMax {
		level = t.scalingMax
	}
	row, ok := t.spellScaling[level]
	if !ok {
		return 0, false
	}
	scale, ok := row[column]
	if !ok {
		return 0, false
	}
	amount := int(math.Floor(scalingPoints*scale + 0.5))
	return amount, amount > 0
}
