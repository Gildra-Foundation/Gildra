package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// Load the selected page's item effects once, then use the same build-pinned,
// batched resolver as detail. Never resolve every candidate in the list query.
func (s *Service) resolveItemSummaries(ctx context.Context, cards []CardSummary) error {
	indices := map[uuid.UUID]int{}
	ids := []uuid.UUID{}
	for i, c := range cards {
		switch c.Type {
		case "item", "gem", "enchantment", "food", "flask", "potion":
			ids = append(ids, c.ID)
			indices[c.ID] = i
		}
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := s.postgres.Query(ctx, `SELECT e.id,v.build_id,v.payload,t.blocks
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id
 JOIN catalog_entity_tooltips t ON t.version_id=v.id AND t.locale=$2
 WHERE e.id=ANY($1::uuid[])`, ids, cards[0].Locale)
	if err != nil {
		return fmt.Errorf("load item summary effects: %w", err)
	}
	entities := []*Entity{}
	for rows.Next() {
		var id uuid.UUID
		var build int64
		var payload, blocks []byte
		if err := rows.Scan(&id, &build, &payload, &blocks); err != nil {
			rows.Close()
			return err
		}
		c := cards[indices[id]]
		// A publication racing this request must not mix the old summary and new effects.
		if c.BuildID == nil || *c.BuildID != build {
			continue
		}
		e := &Entity{ID: id, Product: c.Product, Type: c.Type, ExternalID: c.ExternalID, Locale: c.Locale, BuildID: &build, Tooltip: &Tooltip{}}
		if err := json.Unmarshal(payload, &e.Payload); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(blocks, &e.Tooltip.Blocks); err != nil {
			rows.Close()
			return err
		}
		entities = append(entities, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if err := s.resolveDescriptions(ctx, entities); err != nil {
		return err
	}
	for _, e := range entities {
		card := &cards[indices[e.ID]]
		var lines, effects, sockets []string
		for _, b := range e.Tooltip.Blocks {
			switch b["type"] {
			case "item_level":
				// The row shows the level the numbers belong to.
				if level := int(int64Value(b["value"])); level > 0 && card.ItemLevel != nil {
					card.ItemLevel = &level
				}
			case "weapon_damage", "armor", "stats":
				if line := itemNumbersLine(b, e.Locale); line != "" {
					lines = append(lines, line)
				}
			case "effect":
				text, _ := b["text"].(string)
				if !completeItemEffect(text) {
					continue
				}
				if b["effect_kind"] == "socket_bonus" {
					sockets = append(sockets, text)
				} else {
					effects = append(effects, text)
				}
			}
		}
		if len(sockets) > 0 {
			effects = sockets
		}
		if lines = append(lines, effects...); len(lines) > 0 {
			card.Description = strings.Join(lines, "\n")
		}
	}
	return nil
}

var itemStatNames = map[int][2]string{
	3: {"Agility", "к ловкости"}, 4: {"Strength", "к силе"}, 5: {"Intellect", "к интеллекту"}, 7: {"Stamina", "к выносливости"},
	13: {"Dodge", "к уклонению"}, 14: {"Parry", "к парированию"}, 32: {"Critical Strike", "к критическому удару"},
	36: {"Haste", "к скорости"}, 40: {"Versatility", "к универсальности"}, 49: {"Mastery", "к искусности"},
	61: {"Speed", "к скорости передвижения"}, 62: {"Leech", "к самоисцелению"}, 63: {"Avoidance", "к избеганию"}, 64: {"Indestructible", "к неразрушимости"},
	71: {"Agility / Strength / Intellect", "к ловкости, силе или интеллекту"}, 72: {"Agility / Strength", "к ловкости или силе"},
	73: {"Agility / Intellect", "к ловкости или интеллекту"}, 74: {"Strength / Intellect", "к силе или интеллекту"},
}

// itemNumbersLine is the one-line form of a numeric tooltip block for a list row.
func itemNumbersLine(block map[string]any, locale string) string {
	russian := locale == "ru_RU"
	decimal := func(value float64, digits int) string {
		text := strconv.FormatFloat(value, 'f', digits, 64)
		if russian {
			text = strings.Replace(text, ".", ",", 1)
		}
		return text
	}
	switch block["type"] {
	case "weapon_damage":
		low, high := int64Value(block["min"]), int64Value(block["max"])
		speed, _ := block["speed"].(float64)
		dps, _ := block["dps"].(float64)
		if russian {
			return fmt.Sprintf("Урон: %d–%d · скорость %s · %s ед. урона в секунду", low, high, decimal(speed, 2), decimal(dps, 1))
		}
		return fmt.Sprintf("%d–%d Damage · Speed %s · %s damage per second", low, high, decimal(speed, 2), decimal(dps, 1))
	case "armor":
		if russian {
			return fmt.Sprintf("Броня: %d", int64Value(block["value"]))
		}
		return fmt.Sprintf("%d Armor", int64Value(block["value"]))
	case "stats":
		entries, _ := block["entries"].([]any)
		var parts []string
		for _, raw := range entries {
			entry, _ := raw.(map[string]any)
			names, known := itemStatNames[int(int64Value(entry["stat_type"]))]
			if entry == nil || !known {
				continue
			}
			name := names[0]
			if russian {
				name = names[1]
			}
			parts = append(parts, fmt.Sprintf("+%d %s", int64Value(entry["value"]), name))
		}
		return strings.Join(parts, ", ")
	}
	return ""
}

func completeItemEffect(text string) bool {
	if strings.TrimSpace(text) == "" || strings.Contains(text, "$") {
		return false
	}
	for _, marker := range []string{"game-defined", "effect-defined", "определяемое игрой", "определяемое эффектом", "недоступен в данных", "unavailable in this build"} {
		if strings.Contains(text, marker) {
			return false
		}
	}
	return true
}
