package rotationlab

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var errUnsupportedOwnedBatch = errors.New("equipped instance requires a local_json single simulation")

type ownedEdit struct {
	SlotType  string         `json:"slotType"`
	ItemID    int            `json:"itemId"`
	EnchantID int            `json:"enchantId,omitempty"`
	Gems      []ownedGemEdit `json:"gems"`
}
type ownedGemEdit struct {
	Index  *int `json:"index"`
	ItemID int  `json:"itemId"`
}
type armoryID struct {
	ID int `json:"id"`
}
type armoryType struct {
	Type string `json:"type"`
}
type armorySocket struct {
	SocketType armoryType `json:"socket_type"`
	Item       *armoryID  `json:"item"`
	BonusList  []int      `json:"bonus_list"`
}
type armoryItem struct {
	Item         armoryID       `json:"item"`
	Slot         armoryType     `json:"slot"`
	BonusList    []int          `json:"bonus_list"`
	DropLevel    int            `json:"timewalker_level"`
	CraftedStats []armoryID     `json:"modified_crafting_stat"`
	Sockets      []armorySocket `json:"sockets"`
	Enchantments []struct {
		Slot struct {
			ID *int `json:"id"`
		} `json:"enchantment_slot"`
		ID int `json:"enchantment_id"`
	} `json:"enchantments"`
	Azerite json.RawMessage `json:"azerite_details"`
}

func ownedSimCSlot(slot string) string {
	switch slot {
	case "FINGER_1":
		return "finger1"
	case "FINGER_2":
		return "finger2"
	case "TRINKET_1":
		return "trinket1"
	case "TRINKET_2":
		return "trinket2"
	}
	name := strings.ToLower(slot)
	if slot == strings.ToUpper(slot) && simCGearSlots[name] {
		return name
	}
	return ""
}

func (b simulationBatch) prepareOwnedCandidates() ([]batchCandidate, error) {
	var equipment struct {
		Items []armoryItem `json:"equipped_items"`
	}
	if err := json.Unmarshal(b.Base.Armory.Equipment, &equipment); err != nil {
		return nil, errUnsupportedOwnedBatch
	}
	items := make(map[string]armoryItem, len(equipment.Items))
	for _, item := range equipment.Items {
		if _, duplicate := items[item.Slot.Type]; duplicate {
			return nil, errUnsupportedOwnedBatch
		}
		items[item.Slot.Type] = item
	}
	expected := make(map[string]bool)
	for _, edit := range b.Candidates[0].OwnedChanges {
		expected[edit.SlotType] = true
	}
	prepared := append([]batchCandidate(nil), b.Candidates...)
	for index, row := range prepared {
		seen := make(map[string]bool)
		for _, change := range row.GearChanges {
			seen[change.Slot] = true
		}
		for _, edit := range row.OwnedChanges {
			slot := ownedSimCSlot(edit.SlotType)
			if slot == "" || !expected[edit.SlotType] || seen[slot] || edit.ItemID <= 0 || edit.ItemID > 10_000_000 ||
				edit.EnchantID < 0 || edit.EnchantID > 10_000_000 || (edit.EnchantID == 0 && len(edit.Gems) == 0) {
				return nil, fmt.Errorf("%w: invalid owned slot edit", errInvalidSimulationBatch)
			}
			seen[slot] = true
			item, ok := items[edit.SlotType]
			if !ok || item.Item.ID != edit.ItemID {
				return nil, errUnsupportedOwnedBatch
			}
			line, err := item.editedGearLine(slot, edit)
			if err != nil {
				return nil, err
			}
			prepared[index].ownedLines = append(prepared[index].ownedLines, line)
		}
	}
	return prepared, nil
}

// SimC 18428cd bcp_api::parse_items initializes these numeric fields before
// item data resolution. Reapply them through item_t::parse_options, including
// the native positional gem and per-gem bonus syntax. encoded_item() itself
// can collapse gems/enchantments to stat names, losing their original IDs.
func (item armoryItem) editedGearLine(slot string, edit ownedEdit) (string, error) {
	// The importer treats these legacy items and Azerite powers specially.
	if edit.ItemID == 167555 || edit.ItemID == 158075 || len(item.Azerite) > 0 || len(item.CraftedStats) > 2 || len(item.Sockets) > 3 {
		return "", errUnsupportedOwnedBatch
	}
	change := GearChange{Slot: slot, ItemID: item.Item.ID, BonusIDs: item.BonusList}
	if item.DropLevel != 0 {
		change.Modifiers = append(change.Modifiers, ItemModifier{9, item.DropLevel})
	}
	for i, stat := range item.CraftedStats {
		change.Modifiers = append(change.Modifiers, ItemModifier{29 + i, stat.ID})
	}
	addon := 0
	for _, enchant := range item.Enchantments {
		if enchant.Slot.ID == nil || enchant.ID <= 0 || enchant.ID > 10_000_000 {
			return "", errUnsupportedOwnedBatch
		}
		switch *enchant.Slot.ID {
		case 0:
			change.EnchantID = enchant.ID
		case 7:
			addon = enchant.ID
		}
	}
	if edit.EnchantID > 0 {
		change.EnchantID = edit.EnchantID
	}
	sockets := append([]armorySocket(nil), item.Sockets...)
	used := make(map[int]bool)
	for _, gem := range edit.Gems {
		if gem.Index == nil || *gem.Index < 0 || *gem.Index >= len(sockets) || used[*gem.Index] || gem.ItemID < 1 || gem.ItemID > 10_000_000 {
			return "", fmt.Errorf("%w: invalid owned gem edit", errInvalidSimulationBatch)
		}
		if sockets[*gem.Index].SocketType.Type != "PRISMATIC" {
			return "", errUnsupportedOwnedBatch
		}
		used[*gem.Index] = true
		sockets[*gem.Index] = armorySocket{Item: &armoryID{gem.ItemID}}
	}
	gemBonuses := make([]string, len(sockets))
	hasGemBonuses := false
	for i, socket := range sockets {
		gemBonuses[i] = "0"
		id := 0
		if socket.Item != nil {
			id = socket.Item.ID
			if id <= 0 {
				return "", errUnsupportedOwnedBatch
			}
			if len(socket.BonusList) > 0 {
				values := make([]string, len(socket.BonusList))
				for j, bonus := range socket.BonusList {
					if bonus < 1 || bonus > 1_000_000 {
						return "", errUnsupportedOwnedBatch
					}
					values[j] = strconv.Itoa(bonus)
				}
				gemBonuses[i] = strings.Join(values, ":")
				hasGemBonuses = true
			}
		}
		change.GemIDs = append(change.GemIDs, id)
	}
	if err := validateGearChanges([]GearChange{change}, true); err != nil {
		return "", errUnsupportedOwnedBatch
	}
	// An empty name lets SimC resolve the original DBC name (including named APL checks).
	line := serializeGearItem(change, "")
	if hasGemBonuses {
		line += ",gem_bonus_id=" + strings.Join(gemBonuses, "/")
	}
	if addon > 0 {
		line += ",addon_id=" + strconv.Itoa(addon)
	}
	return line, nil
}
