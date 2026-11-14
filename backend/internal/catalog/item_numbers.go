package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Gildra-Foundation/Gildra/backend/internal/itemscaling"
)

// Item tooltips are completed at read time from the source rows of the
// entity's own build: numbers from the reference tables (internal/itemscaling),
// the socket effect of a gem and the plain ItemSparse facts. Stored blocks of
// a published build are never rewritten, so the same code serves a build whose
// projection predates these blocks and a build projected with them.

const itemReferenceRecheck = time.Minute

type itemReferenceEntry struct {
	tables  *itemscaling.Tables
	stamp   time.Time
	checked time.Time
}

type itemReferenceCache struct {
	mu      sync.Mutex
	entries map[int64]*itemReferenceEntry
}

// tables returns the reference tables of a build, or nil when the build has
// none. The stored set is rechecked so an import becomes visible without a
// restart.
func (s *Service) itemReferenceTables(ctx context.Context, buildID int64) (*itemscaling.Tables, error) {
	cache := &s.itemReference
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.entries == nil {
		cache.entries = map[int64]*itemReferenceEntry{}
	}
	entry := cache.entries[buildID]
	if entry != nil && time.Since(entry.checked) < itemReferenceRecheck {
		return entry.tables, nil
	}
	var stamp *time.Time
	err := s.postgres.QueryRow(ctx, `SELECT max(fetched_at) FROM catalog_item_reference_sources WHERE build_id=$1`, buildID).Scan(&stamp)
	var missing *pgconn.PgError
	if errors.As(err, &missing) && missing.Code == "42P01" {
		// The schema predates the reference tables: nothing is computed.
		cache.entries[buildID] = &itemReferenceEntry{checked: time.Now()}
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("check item reference tables: %w", err)
	}
	if stamp == nil {
		cache.entries[buildID] = &itemReferenceEntry{checked: time.Now()}
		return nil, nil
	}
	if entry != nil && entry.tables != nil && entry.stamp.Equal(*stamp) {
		entry.checked = time.Now()
		return entry.tables, nil
	}
	tables, err := itemscaling.Load(ctx, s.postgres, buildID)
	if err != nil {
		return nil, err
	}
	cache.entries[buildID] = &itemReferenceEntry{tables: tables, stamp: *stamp, checked: time.Now()}
	return tables, nil
}

func itemTooltipType(entityType string) bool {
	switch entityType {
	case "item", "gem", "food", "flask", "potion":
		return true
	}
	return false
}

type db2Payload map[string]any

func (p db2Payload) text(column string) string {
	switch value := p[column].(type) {
	case string:
		return value
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64)
	case nil:
		return ""
	default:
		return fmt.Sprint(value)
	}
}

func (p db2Payload) integer(column string) int64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(p.text(column)), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return int64(value)
}

func (p db2Payload) float(column string) float64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(p.text(column)), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return value
}

type db2Key struct {
	table  string
	locale string
	id     int64
}

func (s *Service) db2Rows(ctx context.Context, buildID int64, tables, locales []string, ids []int64) (map[db2Key]db2Payload, error) {
	found := map[db2Key]db2Payload{}
	if len(ids) == 0 {
		return found, nil
	}
	rows, err := s.postgres.Query(ctx, `SELECT table_name,locale,row_id,payload FROM catalog_db2_rows
		WHERE build_id=$1 AND table_name=ANY($2::text[]) AND locale=ANY($3::text[]) AND row_id=ANY($4::bigint[])`,
		buildID, tables, locales, ids)
	if err != nil {
		return nil, fmt.Errorf("load item source rows: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var key db2Key
		var raw []byte
		if err := rows.Scan(&key.table, &key.locale, &key.id, &raw); err != nil {
			return nil, err
		}
		var payload db2Payload
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, fmt.Errorf("%s row %d: %w", key.table, key.id, err)
		}
		found[key] = payload
	}
	return found, rows.Err()
}

func uniqueIDs(values []int64) []int64 {
	seen := map[int64]bool{}
	var out []int64
	for _, value := range values {
		if value > 0 && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out
}

func (s *Service) completeItemTooltips(ctx context.Context, entities []*Entity) error {
	byBuild := map[int64][]*Entity{}
	for _, entity := range entities {
		if entity != nil && entity.Tooltip != nil && entity.BuildID != nil && entity.Product == "wow" && itemTooltipType(entity.Type) {
			byBuild[*entity.BuildID] = append(byBuild[*entity.BuildID], entity)
		}
	}
	for buildID, items := range byBuild {
		tables, err := s.itemReferenceTables(ctx, buildID)
		if err != nil {
			return err
		}
		ids := make([]int64, 0, len(items))
		for _, entity := range items {
			ids = append(ids, entity.ExternalID)
		}
		source, err := s.db2Rows(ctx, buildID, []string{"ItemSparse", "Item"}, []string{"en_US"}, uniqueIDs(ids))
		if err != nil {
			return err
		}
		var gemIDs, factionIDs []int64
		for _, entity := range items {
			sparse := source[db2Key{"ItemSparse", "en_US", entity.ExternalID}]
			gemIDs = append(gemIDs, sparse.integer("Gem_properties"))
			factionIDs = append(factionIDs, sparse.integer("MinFactionID"))
		}
		gems, err := s.db2Rows(ctx, buildID, []string{"GemProperties"}, []string{"en_US"}, uniqueIDs(gemIDs))
		if err != nil {
			return err
		}
		var enchantIDs []int64
		for _, gem := range gems {
			enchantIDs = append(enchantIDs, gem.integer("Enchant_ID"))
		}
		related, err := s.db2Rows(ctx, buildID, []string{"SpellItemEnchantment"}, []string{"en_US", "ru_RU"}, uniqueIDs(enchantIDs))
		if err != nil {
			return err
		}
		factions, err := s.db2Rows(ctx, buildID, []string{"Faction"}, []string{"en_US", "ru_RU"}, uniqueIDs(factionIDs))
		if err != nil {
			return err
		}
		for key, payload := range gems {
			related[key] = payload
		}
		for key, payload := range factions {
			related[key] = payload
		}
		for _, entity := range items {
			sparse := source[db2Key{"ItemSparse", "en_US", entity.ExternalID}]
			if sparse == nil {
				continue
			}
			completeItemTooltip(entity, tables, sparse, source[db2Key{"Item", "en_US", entity.ExternalID}], related)
		}
	}
	return nil
}

func blockIndex(blocks []map[string]any, blockType string) int {
	for index, block := range blocks {
		if block["type"] == blockType {
			return index
		}
	}
	return -1
}

func removeBlocks(blocks []map[string]any, blockType string) []map[string]any {
	kept := blocks[:0:0]
	for _, block := range blocks {
		if block["type"] != blockType {
			kept = append(kept, block)
		}
	}
	return kept
}

// insertAfter places blocks after the last present anchor type, in order.
func insertAfter(blocks []map[string]any, added []map[string]any, anchors ...string) []map[string]any {
	if len(added) == 0 {
		return blocks
	}
	position := 0
	for _, anchor := range anchors {
		if index := blockIndex(blocks, anchor); index >= position {
			position = index + 1
		}
	}
	out := make([]map[string]any, 0, len(blocks)+len(added))
	out = append(out, blocks[:position]...)
	out = append(out, added...)
	return append(out, blocks[position:]...)
}

func completeItemTooltip(entity *Entity, tables *itemscaling.Tables, sparse, registry db2Payload, related map[db2Key]db2Payload) {
	blocks := entity.Tooltip.Blocks
	var headline []map[string]any
	weaponShown := false
	if tables != nil && registry != nil {
		if item, ok := itemscaling.ItemFromPayloads(sparse.text, registry.text); ok {
			level := tables.ItemLevel(item.ItemLevel, item.SquishEra)
			numbers, own := tables.Compute(entity.ExternalID, item)
			if own {
				level = numbers.ItemLevel
			}
			if index := blockIndex(blocks, "item_level"); index >= 0 && level > 0 {
				blocks[index]["value"] = level
			}
			if own {
				if weapon := numbers.Weapon; weapon != nil {
					weaponShown = true
					headline = append(headline, map[string]any{"type": "weapon_damage", "min": weapon.Min, "max": weapon.Max,
						"speed": weapon.Speed, "dps": math.Round(weapon.DPS*10) / 10})
				}
				if numbers.Armor > 0 {
					headline = append(headline, map[string]any{"type": "armor", "value": numbers.Armor})
				}
				if len(numbers.Stats) > 0 {
					entries := make([]any, 0, len(numbers.Stats))
					for _, stat := range numbers.Stats {
						entries = append(entries, map[string]any{"stat_type": stat.Type, "value": stat.Value})
					}
					blocks = removeBlocks(blocks, "stats")
					headline = append(headline, map[string]any{"type": "stats", "entries": entries, "source": "db2"})
					fillVariantStats(blocks, numbers)
				}
			}
		}
	}
	blocks = removeBlocks(removeBlocks(blocks, "weapon_damage"), "armor")
	if weaponShown {
		blocks = removeBlocks(blocks, "weapon_speed")
	}
	blocks = insertAfter(blocks, headline, "name", "item_level", "slot", "subclass")
	// Older projections stored the ownership limit (MaxCount) as the stack
	// size; the stack size is ItemSparse.Stackable.
	blocks = removeBlocks(blocks, "stack_limit")
	blocks = insertAfter(blocks, itemFactBlocks(blocks, entity.Locale, sparse, registry, related, weaponShown),
		"name", "item_level", "slot", "subclass", "weapon_damage", "armor", "stats", "binding", "required_level", "required_skill")
	blocks = completeGemEffect(blocks, entity, tables, sparse, related)
	entity.Tooltip.Blocks = blocks
}

// The base variant lists the same stat slots; give them the amounts too.
func fillVariantStats(blocks []map[string]any, numbers itemscaling.Numbers) {
	index := blockIndex(blocks, "item_variants")
	if index < 0 {
		return
	}
	entries, _ := blocks[index]["entries"].([]any)
	for _, raw := range entries {
		variant, _ := raw.(map[string]any)
		if variant == nil || (variant["key"] != "base" && variant["key"] != nil) {
			continue
		}
		variant["item_level"] = numbers.ItemLevel
		stats, _ := variant["stats"].([]any)
		used := map[int]bool{}
		for _, rawStat := range stats {
			stat, _ := rawStat.(map[string]any)
			if stat == nil || stat["value"] != nil {
				continue
			}
			statType := int(int64Value(stat["type"]))
			for _, computed := range numbers.Stats {
				// Slots of one stat are summed on the tooltip: the first carries the amount.
				if computed.Type == statType && !used[statType] {
					stat["value"] = computed.Value
					used[statType] = true
				}
			}
		}
	}
}

const itemFlagUniqueEquipped = 0x80000 // Flags_0

// itemFactBlocks returns the plain ItemSparse facts the stored blocks lack.
func itemFactBlocks(blocks []map[string]any, locale string, sparse, registry db2Payload, related map[db2Key]db2Payload, weaponShown bool) []map[string]any {
	var facts []map[string]any
	has := func(blockType string) bool { return blockIndex(blocks, blockType) >= 0 }
	if !weaponShown && !has("weapon_speed") && registry.integer("ClassID") == 2 && sparse.integer("ItemDelay") > 0 {
		facts = append(facts, map[string]any{"type": "weapon_speed", "seconds": float64(sparse.integer("ItemDelay")) / 1000})
	}
	if sparse.integer("Stackable") > 1 {
		facts = append(facts, map[string]any{"type": "stack_limit", "value": sparse.integer("Stackable")})
	}
	if !has("unique_equipped") && sparse.integer("Flags_0")&itemFlagUniqueEquipped != 0 {
		facts = append(facts, map[string]any{"type": "unique_equipped"})
	}
	if count := sparse.integer("MaxCount"); count > 0 && !has("unique") {
		facts = append(facts, map[string]any{"type": "unique", "quantity": count})
	}
	if faction := sparse.integer("MinFactionID"); faction > 0 && !has("required_reputation") {
		rank := sparse.integer("MinReputation")
		name := related[db2Key{"Faction", locale, faction}].text("Name_lang")
		if name != "" && rank >= 0 && rank <= 7 {
			facts = append(facts, map[string]any{"type": "required_reputation", "name": name, "rank": rank})
		}
	}
	return facts
}

const enchantEffectStat = 5 // SpellItemEnchantment.Effect: stat bonus

// Artifact relic and archaeology enchantments carry internal names
// ("Relic Enhancement"); only combat effects, equip and use spells,
// resistances and stats are printed on a gem.
func playerFacingEnchant(enchant db2Payload) bool {
	for slot := 0; slot < 3; slot++ {
		switch enchant.integer("Effect_" + strconv.Itoa(slot)) {
		case 1, 2, 3, 4, 5, 7:
			return true
		}
	}
	return false
}

// completeGemEffect adds the socket effect of a gem when the stored blocks
// lack it, and gives every socket effect its amounts and its Russian text.
func completeGemEffect(blocks []map[string]any, entity *Entity, tables *itemscaling.Tables, sparse db2Payload, related map[db2Key]db2Payload) []map[string]any {
	index := -1
	for position, block := range blocks {
		if block["type"] == "effect" && block["effect_kind"] == "socket_bonus" {
			index = position
		}
	}
	if index < 0 {
		properties := sparse.integer("Gem_properties")
		gem := related[db2Key{"GemProperties", "en_US", properties}]
		enchantID := gem.integer("Enchant_ID")
		enchant := related[db2Key{"SpellItemEnchantment", "en_US", enchantID}]
		if gem == nil || enchant == nil || enchant.text("Name_lang") == "" || !playerFacingEnchant(enchant) {
			return blocks
		}
		text := enchant.text("Name_lang")
		if local := related[db2Key{"SpellItemEnchantment", entity.Locale, enchantID}].text("Name_lang"); local != "" {
			text = local
		}
		stats := []any{}
		for slot := 0; slot < 3; slot++ {
			suffix := strconv.Itoa(slot)
			if enchant.integer("Effect_"+suffix) != enchantEffectStat {
				continue
			}
			stat := map[string]any{"index": float64(slot), "stat_type": float64(enchant.integer("EffectArg_" + suffix)),
				"value": nil, "scaling_coefficient": enchant.float("EffectScalingPoints_" + suffix)}
			if enchant.integer("ScalingClass") == 0 && enchant.float("EffectScalingPoints_"+suffix) == 0 {
				stat["value"] = enchant.float("EffectPointsMin_" + suffix)
			}
			stats = append(stats, stat)
		}
		status := "source_values"
		if enchant.integer("ScalingClass") != 0 {
			status = "requires_scaling"
		}
		block := map[string]any{"type": "effect", "effect_kind": "socket_bonus", "gem_properties_id": properties,
			"enchantment_id": enchantID, "source": "db2", "source_build_id": *entity.BuildID, "text": text, "raw_text": text,
			"value_status": status, "scaling_class": float64(enchant.integer("ScalingClass")),
			"min_level": float64(enchant.integer("MinLevel")), "max_level": float64(enchant.integer("MaxLevel")), "stats": stats}
		position := len(blocks)
		for at, existing := range blocks {
			if existing["type"] == "effect" || existing["type"] == "acquisition" || existing["type"] == "item_requirements" {
				position = at
				break
			}
		}
		blocks = append(blocks[:position:position], append([]map[string]any{block}, blocks[position:]...)...)
		index = position
	}
	block := blocks[index]
	if entity.Locale == "ru_RU" && tables != nil {
		if name := tables.EnchantmentNameRU(int64Value(block["enchantment_id"])); name != "" {
			previous, _ := block["text"].(string)
			block["text"], block["raw_text"] = name, name
			if previous != "" && previous != name {
				entity.Tooltip.PlainText = strings.ReplaceAll(entity.Tooltip.PlainText, previous, name)
			}
		}
	}
	if tables == nil {
		return blocks
	}
	// A scaled stat is shown at the enchantment's level cap, as the client
	// shows it to a character at the level cap.
	stats, _ := block["stats"].([]any)
	scalingClass, maxLevel := int(int64Value(block["scaling_class"])), int(int64Value(block["max_level"]))
	for _, raw := range stats {
		stat, _ := raw.(map[string]any)
		if stat == nil || stat["value"] != nil || scalingClass == 0 {
			continue
		}
		coefficient, _ := stat["scaling_coefficient"].(float64)
		if amount, ok := tables.EnchantAmount(coefficient, scalingClass, maxLevel); ok {
			stat["value"] = float64(amount)
			block["value_status"] = "scaled_at_level_cap"
		}
	}
	return blocks
}
