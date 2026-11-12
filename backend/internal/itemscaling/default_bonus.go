package itemscaling

import (
	"math"
	"strconv"
)

// An item may name bonus trees (ItemXBonusTree). The bonus lists of the
// default context (ItemContext 0) decide what the item is like when it is
// created without a drop context. Three outcomes matter for the numbers:
//
//   - nothing that sets a level: the item keeps its own ItemSparse level;
//   - one ItemScalingConfig with a fixed level (ItemBonus type 49, config flag
//     1): the level is ItemOffsetCurve(config.ItemLevel) + Offset;
//   - anything else that sets or scales the level (by character level, by a
//     selector or a bonus group): the item has no level of its own.
const (
	bonusModeFixed   = "fixed"
	bonusModeContext = "context"
)

const (
	bonusTypeQuality       = 3
	bonusTypeScalingConfig = 49
)

// Bonus types of a default context after which the item level is no longer
// the ItemSparse level (increment, scaling distributions, level curves and
// offsets, bonus list groups).
var levelBonusTypes = map[int]bool{1: true, 11: true, 13: true, 14: true, 16: true, 27: true, 34: true, 35: true, 42: true, 50: true, 51: true}

type defaultBonus struct {
	mode    string
	level   int
	quality int // 0 keeps the item's quality
}

type bonusSources struct {
	itemTrees   map[int64][]int64
	nodes       map[int64][]map[string]string // by ParentItemBonusTreeID
	bonuses     map[int64][]map[string]string // by ParentItemBonusListID
	configs     map[int64]map[string]string
	offsets     map[int64]map[string]string
	curvePoints map[int64][]curvePoint // ordered
}

func integer(payload map[string]string, column string) int64 {
	value, _ := strconv.ParseInt(payload[column], 10, 64)
	return value
}

func (s *bonusSources) defaultContext(tree int64, depth int, visit func(bonus map[string]string), unresolved *bool) {
	if depth > 5 {
		*unresolved = true
		return
	}
	for _, node := range s.nodes[tree] {
		if integer(node, "ItemContext") != 0 {
			continue
		}
		if integer(node, "ChildItemLevelSelectorID") != 0 || integer(node, "ChildItemBonusListGroupID") != 0 {
			*unresolved = true
		}
		if list := integer(node, "ChildItemBonusListID"); list != 0 {
			for _, bonus := range s.bonuses[list] {
				visit(bonus)
			}
		}
		if child := integer(node, "ChildItemBonusTreeID"); child != 0 {
			s.defaultContext(child, depth+1, visit, unresolved)
		}
	}
}

// derive returns one row per item whose default context changes the level.
func (s *bonusSources) derive() []Row {
	var rows []Row
	for item, trees := range s.itemTrees {
		var configs []int64
		quality, unresolved := 0, false
		for _, tree := range trees {
			s.defaultContext(tree, 0, func(bonus map[string]string) {
				switch kind := int(integer(bonus, "Type")); {
				case kind == bonusTypeScalingConfig:
					configs = append(configs, integer(bonus, "Value_0"))
				case kind == bonusTypeQuality:
					if value := int(integer(bonus, "Value_0")); value > quality {
						quality = value
					}
				case levelBonusTypes[kind]:
					unresolved = true
				}
			}, &unresolved)
		}
		if len(configs) == 0 && !unresolved {
			continue
		}
		payload := map[string]string{"Mode": bonusModeContext}
		if len(configs) == 1 && !unresolved {
			if level, ok := s.fixedLevel(configs[0]); ok {
				payload = map[string]string{"Mode": bonusModeFixed, "ItemLevel": strconv.Itoa(level), "Quality": strconv.Itoa(quality)}
			}
		}
		rows = append(rows, Row{Table: TableDefaultBonus, Key: item, Payload: payload})
	}
	return rows
}

func (s *bonusSources) fixedLevel(config int64) (int, bool) {
	row := s.configs[config]
	if row == nil || integer(row, "Flags")&1 == 0 || integer(row, "ItemLevel") <= 0 {
		return 0, false
	}
	offset := s.offsets[integer(row, "ItemOffsetCurveID")]
	if offset == nil {
		return 0, false
	}
	points := s.curvePoints[integer(offset, "CurveID")]
	if len(points) == 0 {
		return 0, false
	}
	level := int(math.Floor(evaluate(points, float64(integer(row, "ItemLevel")))+0.5)) + int(integer(offset, "Offset"))
	return level, level > 0
}
