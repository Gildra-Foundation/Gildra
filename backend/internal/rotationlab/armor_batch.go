package rotationlab

import "encoding/json"

const (
	armorSpeed byte = 1 << iota
	armorLeech
	armorAvoidance
	allArmorRatings = armorSpeed | armorLeech | armorAvoidance
)

// The pinned DBC gives these explicit enchants only direct, player-level
// ratings. Boots also give stamina. Keep the rank even when no rating is read.
// Negative IDs exist only in comparison keys and never reach the simulator.
func armorEnchantKey(slot string, id int, reads byte) int {
	var axis byte
	key := -1
	switch slot {
	case "FEET":
		switch id {
		case 7962, 7963:
			axis = armorAvoidance
		case 7992, 7993:
			axis = armorLeech
		case 8018, 8019:
			axis = armorSpeed
		default:
			return id
		}
		key -= id % 2
	case "HEAD":
		switch id {
		case 8014, 8015:
			axis = armorAvoidance
		case 7958, 7959:
			axis = armorLeech
		case 7988, 7989:
			axis = armorSpeed
		default:
			return id
		}
	case "SHOULDER":
		switch id {
		case 7998, 7999, 8000, 8001:
			axis = armorAvoidance
		case 8028, 8029, 8030, 8031:
			axis = armorLeech
		case 7970, 7971, 7972, 7973:
			axis = armorSpeed
		default:
			return id
		}
	default:
		return id
	}
	if reads&axis != 0 {
		return id
	}
	return key
}

// Ratings available for a substitution of the same boot rank. A read of
// the original enchant's rating makes it ineligible for substitution.
func equivalentBootRatings(row batchCandidate, reads byte) byte {
	for _, edit := range row.OwnedChanges {
		if edit.SlotType == "FEET" && armorEnchantKey("FEET", edit.EnchantID, reads) < 0 && edit.EnchantID > 0 {
			return allArmorRatings &^ reads
		}
	}
	return 0
}

// The armory, APL, seed, precision and encounter belong to the enclosing
// batch. Preserve every purchased item, owned instance, gem and unrelated edit.
func armorBatchKey(row batchCandidate, reads byte) string {
	row.OwnedChanges = append([]ownedEdit(nil), row.OwnedChanges...)
	for i := range row.OwnedChanges {
		edit := &row.OwnedChanges[i]
		edit.EnchantID = armorEnchantKey(edit.SlotType, edit.EnchantID, reads)
	}
	key, _ := json.Marshal(row) // Numeric and string fields only.
	return string(key)
}

func simulateArmorBatch(candidates []batchCandidate, shareBootScores bool, run func([]batchCandidate, *byte) ([]batchMeasurement, error)) ([]batchMeasurement, error) {
	indices := make(map[string]int)
	var anchors []batchCandidate
	anchorFor := make([]int, len(candidates))
	for i, row := range candidates {
		key := armorBatchKey(row, 0)
		index, ok := indices[key]
		if !ok {
			index = len(anchors)
			indices[key] = index
			anchors = append(anchors, row)
		}
		anchorFor[i] = index
	}
	if len(anchors) == len(candidates) {
		if !shareBootScores {
			return run(candidates, nil)
		}
		hasBoots := false
		for _, row := range anchors {
			if equivalentBootRatings(row, 0) != 0 {
				hasBoots = true
				break
			}
		}
		if !hasBoots {
			return run(candidates, nil)
		}
	}

	// A read on any actor or iteration in the anchor packet protects that axis
	// for the entire packet. Older engines leave all three axes protected.
	reads := byte(allArmorRatings)
	measured, err := run(anchors, &reads)
	if err != nil {
		return nil, err
	}
	keys := make([]string, len(anchors))
	for i, row := range anchors {
		keys[i] = armorBatchKey(row, reads)
	}

	results := make([]batchMeasurement, len(candidates))
	var unresolved []batchCandidate
	var positions []int
	for i, row := range candidates {
		anchor := anchorFor[i]
		if keys[anchor] == armorBatchKey(row, reads) {
			results[i] = measured[anchor]
			if shareBootScores {
				results[i].EquivalentBootRatings = equivalentBootRatings(row, reads)
			}
		} else {
			positions = append(positions, i)
			unresolved = append(unresolved, row)
		}
	}
	if len(unresolved) > 0 {
		extra, err := run(unresolved, nil)
		if err != nil {
			return nil, err
		}
		for j, i := range positions {
			results[i] = extra[j]
		}
	}
	// Only row zero of the original native packet carries the primary actor's
	// private role evidence, including when a fallback packet had its own primary.
	for i := 1; i < len(results); i++ {
		results[i].furyWithoutLeechHealing = false
	}
	return results, nil
}
