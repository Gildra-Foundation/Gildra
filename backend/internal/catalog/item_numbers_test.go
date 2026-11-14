package catalog

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/itemscaling"
)

type itemReferenceFixture struct {
	Rows  []itemscaling.Row `json:"rows"`
	Items []struct {
		ID        int64             `json:"id"`
		Sparse    map[string]string `json:"sparse"`
		Registry  map[string]string `json:"registry"`
		ItemLevel int               `json:"item_level"`
		Armor     int               `json:"armor"`
		Weapon    *struct{ Min, Max int }
	} `json:"items"`
}

func loadItemReferenceFixture(t *testing.T) (itemReferenceFixture, *itemscaling.Tables) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "itemscaling", "testdata", "reference-items.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture itemReferenceFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	tables, err := itemscaling.Parse(fixture.Rows)
	if err != nil {
		t.Fatal(err)
	}
	return fixture, tables
}

func payloadOf(values map[string]string) db2Payload {
	payload := db2Payload{}
	for key, value := range values {
		payload[key] = value
	}
	return payload
}

func blockTypes(blocks []map[string]any) []string {
	types := make([]string, 0, len(blocks))
	for _, block := range blocks {
		types = append(types, block["type"].(string))
	}
	return types
}

func TestItemTooltipGetsNumbersOfItsBuild(t *testing.T) {
	fixture, tables := loadItemReferenceFixture(t)
	build := int64(92)
	weapons, armors := 0, 0
	for _, item := range fixture.Items {
		sparse, registry := payloadOf(item.Sparse), payloadOf(item.Registry)
		entity := &Entity{Type: "item", Product: "wow", ExternalID: item.ID, Locale: "en_US", BuildID: &build, Tooltip: &Tooltip{Blocks: []map[string]any{
			{"type": "name", "text": "x"}, {"type": "item_level", "value": float64(1300)}, {"type": "slot", "code": float64(1)},
			{"type": "subclass"}, {"type": "binding", "code": float64(1)},
			{"type": "item_variants", "entries": []any{map[string]any{"key": "base", "item_level": float64(1300),
				"stats": []any{map[string]any{"type": float64(7), "value": nil}}}}},
		}}}
		completeItemTooltip(entity, tables, sparse, registry, nil)
		blocks := entity.Tooltip.Blocks
		if level := blocks[blockIndex(blocks, "item_level")]["value"]; level != item.ItemLevel {
			t.Fatalf("item %d: level %v, official %d", item.ID, level, item.ItemLevel)
		}
		if item.Weapon != nil {
			weapons++
			block := blocks[blockIndex(blocks, "weapon_damage")]
			if block["min"] != item.Weapon.Min || block["max"] != item.Weapon.Max || blockIndex(blocks, "weapon_speed") >= 0 {
				t.Fatalf("item %d: weapon %v, official %+v", item.ID, block, *item.Weapon)
			}
		}
		if item.Armor > 0 {
			armors++
			if block := blocks[blockIndex(blocks, "armor")]; block["value"] != item.Armor {
				t.Fatalf("item %d: armor %v, official %d", item.ID, block, item.Armor)
			}
		}
		// Numbers sit between the item's type and its binding, as on the game tooltip.
		if binding, stats := blockIndex(blocks, "binding"), blockIndex(blocks, "stats"); stats >= 0 && (stats > binding || stats < blockIndex(blocks, "subclass")) {
			t.Fatalf("item %d: order %v", item.ID, blockTypes(blocks))
		}
		if stats := blockIndex(blocks, "stats"); stats >= 0 {
			variant := blocks[blockIndex(blocks, "item_variants")]["entries"].([]any)[0].(map[string]any)
			if variant["item_level"] != item.ItemLevel {
				t.Fatalf("item %d: base variant level %v", item.ID, variant["item_level"])
			}
		}
	}
	if weapons < 5 || armors < 10 {
		t.Fatalf("fixture covers %d weapons and %d armor pieces", weapons, armors)
	}
}

func TestItemTooltipWithoutReferenceTablesKeepsStoredBlocks(t *testing.T) {
	fixture, _ := loadItemReferenceFixture(t)
	item := fixture.Items[0]
	build := int64(92)
	entity := &Entity{Type: "item", Product: "wow", ExternalID: item.ID, Locale: "en_US", BuildID: &build,
		Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "name"}, {"type": "item_level", "value": float64(35)}}}}
	completeItemTooltip(entity, nil, payloadOf(item.Sparse), payloadOf(item.Registry), nil)
	blocks := entity.Tooltip.Blocks
	if blocks[1]["value"] != float64(35) || blockIndex(blocks, "stats") >= 0 || blockIndex(blocks, "armor") >= 0 || blockIndex(blocks, "weapon_damage") >= 0 {
		t.Fatalf("numbers appeared without the build's tables: %v", blocks)
	}
}

func TestItemFactsFromSourceRow(t *testing.T) {
	build := int64(92)
	sparse := db2Payload{"Stackable": "200", "MaxCount": "1", "Flags_0": "524288", "MinFactionID": "1168", "MinReputation": "5", "ItemDelay": "2600"}
	related := map[db2Key]db2Payload{{"Faction", "ru_RU", 1168}: {"Name_lang": "Гильдия"}}
	entity := &Entity{Type: "item", Product: "wow", ExternalID: 1, Locale: "ru_RU", BuildID: &build,
		Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "name"}, {"type": "stack_limit", "value": float64(20)}}}}
	completeItemTooltip(entity, nil, sparse, db2Payload{"ClassID": "2", "SubclassID": "7"}, related)
	blocks := entity.Tooltip.Blocks
	// The stack size comes from the source row; each fact appears once.
	if blocks[blockIndex(blocks, "stack_limit")]["value"] != int64(200) || len(blocks) != 6 {
		t.Fatalf("%v", blocks)
	}
	if blocks[blockIndex(blocks, "weapon_speed")]["seconds"] != 2.6 || blocks[blockIndex(blocks, "unique")]["quantity"] != int64(1) ||
		blockIndex(blocks, "unique_equipped") < 0 || blocks[blockIndex(blocks, "required_reputation")]["name"] != "Гильдия" {
		t.Fatalf("%v", blocks)
	}
}

func TestGemSocketEffectFromSourceRows(t *testing.T) {
	_, tables := loadItemReferenceFixture(t)
	build := int64(92)
	related := map[db2Key]db2Payload{
		{"GemProperties", "en_US", 1}:         {"Enchant_ID": "10"},
		{"SpellItemEnchantment", "en_US", 10}: {"Name_lang": "+$k1 Versatility", "Effect_0": "5", "Effect_1": "0", "Effect_2": "0", "EffectArg_0": "40", "EffectPointsMin_0": "4", "EffectScalingPoints_0": "0.5", "ScalingClass": "-4", "MinLevel": "0", "MaxLevel": "27"},
		{"GemProperties", "en_US", 2}:         {"Enchant_ID": "11"},
		{"SpellItemEnchantment", "en_US", 11}: {"Name_lang": "+$k1 Stamina and +$k2 Critical Strike", "Effect_0": "5", "Effect_1": "5", "Effect_2": "0", "EffectArg_0": "7", "EffectArg_1": "32", "EffectPointsMin_0": "3", "EffectPointsMin_1": "4", "EffectScalingPoints_0": "0", "EffectScalingPoints_1": "0", "ScalingClass": "0", "MaxLevel": "50"},
		{"GemProperties", "en_US", 3}:         {"Enchant_ID": "12"},
		{"SpellItemEnchantment", "en_US", 12}: {"Name_lang": "+$k1 Strength", "Effect_0": "5", "EffectArg_0": "4", "EffectScalingPoints_0": "1", "ScalingClass": "8", "MaxLevel": "27"},
	}
	for _, test := range []struct {
		gem  string
		want string
	}{{"1", "+1 Versatility"}, {"2", "+3 Stamina and +4 Critical Strike"}, {"3", ""}} {
		entity := &Entity{Type: "item", Product: "wow", ExternalID: 1, Locale: "en_US", BuildID: &build,
			Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "name"}, {"type": "effect", "text": "Use"}}}}
		completeItemTooltip(entity, tables, db2Payload{"Gem_properties": test.gem}, nil, related)
		if err := resolveEntityDescriptions(t.Context(), &spellValueCache{}, entity); err != nil {
			t.Fatal(err)
		}
		block := entity.Tooltip.Blocks[1]
		if block["effect_kind"] != "socket_bonus" || block["text"] != test.want {
			t.Fatalf("gem %s: %v", test.gem, block)
		}
	}
	relic := &Entity{Type: "item", Product: "wow", ExternalID: 1, Locale: "en_US", BuildID: &build, Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "name"}}}}
	completeItemTooltip(relic, tables, db2Payload{"Gem_properties": "4"}, nil, related)
	if len(relic.Tooltip.Blocks) != 1 {
		t.Fatalf("an internal relic enchantment name was printed: %v", relic.Tooltip.Blocks)
	}
}
