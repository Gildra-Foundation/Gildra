package catalog

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// World context is a read of the published build, never latest-version data.
// Client tuning IDs and pet levels are deliberately not character levels.
func (s *Service) enrichWorldContext(ctx context.Context, entity *Entity) error {
	table := map[string]string{"area": "AreaTable", "map": "Map", "ui_map": "UiMap", "faction": "Faction", "currency": "CurrencyTypes", "creature": "Creature", "instance": "JournalInstance"}[entity.Type]
	if table == "" || entity.BuildID == nil {
		return nil
	}
	var raw []byte
	err := s.postgres.QueryRow(ctx, worldContextSQL, *entity.BuildID, table, entity.ExternalID, entity.Locale).Scan(&raw)
	if err != nil {
		return fmt.Errorf("read world context: %w", err)
	}
	var facts map[string]any
	if err = json.Unmarshal(raw, &facts); err != nil {
		return err
	}
	if entity.Payload == nil {
		entity.Payload = map[string]any{}
	}
	entity.Payload["world"] = facts
	enrichWorldFacts(entity, facts)
	appendWorldTooltip(entity, facts)
	// The picture is the existing z=0 atlas tile, not invented artwork or a
	// guessed URL. Only files verified by the checked-in atlas manifest qualify.
	if ids, ok := facts["ui_map_ids"].([]any); ok {
		pictures := []any{}
		for _, id := range ids {
			key := strconv.FormatInt(int64(id.(float64)), 10)
			if art, ok := worldMapPictures[key]; ok {
				picture := make(map[string]any, len(art)+1)
				for key, value := range art {
					picture[key] = value
				}
				picture["ui_map_id"] = id
				if entity.Locale == "ru_RU" {
					if url, ok := art["image_url_ru"]; ok {
						picture["image_url"] = url
						picture["tile_url"] = art["tile_url_ru"]
					}
				}
				pictures = append(pictures, picture)
			}
		}
		facts["map_pictures"] = pictures
	}
	// Public API intentionally omits raw Payload. Export only structured facts
	// through its existing extensible tooltip-block contract.
	public := map[string]any{"type": "world_info"}
	for key, value := range facts {
		if key != "source" && key != "content_tuning" && key != "currency_category" && key != "paragon" {
			public[key] = value
		}
	}
	if paragon, ok := facts["paragon"].(map[string]any); ok {
		for key, field := range map[string]string{"paragon_threshold": "LevelThreshold", "paragon_quest_id": "QuestID"} {
			if value, ok := paragon[field].(string); ok {
				if n, err := strconv.ParseInt(value, 10, 64); err == nil {
					public[key] = n
				}
			}
		}
	}
	if entity.Tooltip == nil {
		entity.Tooltip = &Tooltip{}
	}
	entity.Tooltip.Blocks = append(entity.Tooltip.Blocks, public)
	return nil
}

// Creature.Classification 3 is obsolete, not evidence that this is a boss.
// Enum: TrinityCore SharedDefines.h, CreatureClassifications.
func enrichWorldFacts(entity *Entity, facts map[string]any) {
	raw, _ := facts["source"].(map[string]any)
	fields := map[string]string{}
	switch entity.Type {
	case "area":
		fields = map[string]string{"parent_area_id": "ParentAreaID", "map_id": "ContinentID", "content_tuning_id": "ContentTuningID"}
	case "map":
		fields = map[string]string{"parent_map_id": "ParentMapID", "expansion_id": "ExpansionID", "instance_type": "InstanceType"}
	case "ui_map":
		fields = map[string]string{"parent_ui_map_id": "ParentUiMapID", "content_tuning_id": "ContentTuningID", "map_type": "Type"}
	case "instance":
		fields = map[string]string{"map_id": "MapID"}
	case "faction":
		fields = map[string]string{"parent_faction_id": "ParentFactionID", "expansion_id": "Expansion", "paragon_faction_id": "ParagonFactionID", "renown_currency_id": "RenownCurrencyID", "reputation_index": "ReputationIndex"}
		rules := []any{}
		for slot := 0; slot < 4; slot++ {
			rule := map[string]any{}
			for _, prefix := range []string{"ReputationBase", "ReputationMax", "ReputationFlags", "ReputationClassMask"} {
				if value, ok := raw[fmt.Sprintf("%s_%d", prefix, slot)].(string); ok {
					if n, err := strconv.ParseInt(value, 10, 64); err == nil {
						rule[prefix] = n
					}
				}
			}
			for half := 0; half < 2; half++ {
				key := fmt.Sprintf("ReputationRaceMasks%d_%d", slot, half)
				if value, ok := raw[key]; ok {
					rule[fmt.Sprintf("race_mask_%d", half)] = value
				}
			}
			if len(rule) > 0 {
				rules = append(rules, rule)
			}
		}
		facts["reputation_rules"] = rules
	case "currency":
		fields = map[string]string{"category_id": "CategoryID", "icon_file_data_id": "InventoryIconFileID", "max_quantity_raw": "MaxQty", "weekly_cap_raw": "MaxEarnablePerWeek", "faction_id": "FactionID"}
		// CurrencyTypesFlags: 0x8 scales stored quantities by 100; dynamic or
		// season-relative maxima are not fixed caps for the current character.
		number := func(key string) int64 {
			value, _ := raw[key].(string)
			n, _ := strconv.ParseInt(value, 10, 64)
			return n
		}
		scale := float64(1)
		if number("Flags_0")&8 != 0 {
			scale = 100
		}
		facts["quantity_scale"] = scale
		if number("MaxQty") > 0 && number("Flags_0")&0x40000 == 0 && number("Flags_1")&0xc0 == 0 && number("MaxQtyWorldStateID") == 0 {
			facts["max_quantity"] = float64(number("MaxQty")) / scale
		}
		if number("MaxEarnablePerWeek") > 0 && number("Flags_0")&4 == 0 {
			facts["weekly_cap"] = float64(number("MaxEarnablePerWeek")) / scale
		}
	case "creature":
		fields = map[string]string{"classification_id": "Classification", "type_id": "CreatureType", "family_id": "CreatureFamily"}
		codes := map[string]string{"0": "normal", "1": "elite", "2": "rare_elite", "4": "rare", "5": "trivial", "6": "minus"}
		if code, ok := raw["Classification"].(string); ok {
			if name, ok := codes[code]; ok {
				facts["classification"] = name
			}
		}
		displays := []any{}
		for slot := 0; slot < 4; slot++ {
			if value, ok := raw[fmt.Sprintf("DisplayID_%d", slot)].(string); ok {
				if id, err := strconv.ParseInt(value, 10, 64); err == nil && id > 0 {
					displays = append(displays, map[string]any{"display_id": id, "probability": raw[fmt.Sprintf("DisplayProbability_%d", slot)]})
				}
			}
		}
		facts["displays"] = displays
	}
	if tuning, ok := facts["content_tuning"].(map[string]any); ok {
		number := func(key string) int64 {
			value, _ := tuning[key].(string)
			n, _ := strconv.ParseInt(value, 10, 64)
			return n
		}
		// Relative scaling offsets and account-expansion scaling are contextual;
		// keep their raw tuning but do not present them as an absolute level range.
		complete := true
		for _, key := range []string{"MinLevelScalingOffset", "MaxLevelScalingOffset", "Flags", "MinLevelSquish", "MaxLevelSquish"} {
			value, ok := tuning[key].(string)
			if _, err := strconv.ParseInt(value, 10, 64); !ok || err != nil {
				complete = false
			}
		}
		if complete && number("MinLevelScalingOffset") == 0 && number("MaxLevelScalingOffset") == 0 && number("Flags")&2 == 0 && number("MinLevelSquish") > 0 && number("MaxLevelSquish") >= number("MinLevelSquish") {
			facts["level_range"] = map[string]any{"min": number("MinLevelSquish"), "max": number("MaxLevelSquish")}
		}
	}
	for key, field := range fields {
		if value, ok := raw[field].(string); ok {
			if n, err := strconv.ParseInt(value, 10, 64); err == nil {
				facts[key] = n
			}
		}
	}
}

func appendWorldTooltip(entity *Entity, facts map[string]any) {
	add := func(text string) {
		if text == "" {
			return
		}
		if entity.Tooltip == nil {
			entity.Tooltip = &Tooltip{}
		}
		entity.Tooltip.Blocks = append(entity.Tooltip.Blocks, map[string]any{"type": "subtext", "text": text})
	}
	if entity.Type == "creature" {
		labels := map[string][2]string{"elite": {"Elite", "Элита"}, "rare_elite": {"Rare elite", "Редкая элита"}, "rare": {"Rare", "Редкое"}}
		if code, ok := facts["classification"].(string); ok {
			if label, ok := labels[code]; ok {
				lang := 0
				if entity.Locale == "ru_RU" {
					lang = 1
				}
				add(label[lang])
			}
		}
	}
	if entity.Type == "area" {
		if ancestors, ok := facts["ancestors"].([]any); ok {
			names := []string{}
			for _, a := range ancestors {
				if a, ok := a.(map[string]any); ok {
					if name, ok := a["name"].(string); ok && name != "" {
						names = append(names, name)
					}
				}
			}
			add(strings.Join(names, " · "))
		}
	}
	if bounds, ok := facts["level_range"].(map[string]any); ok && (entity.Type == "area" || entity.Type == "ui_map") {
		label := "Level"
		if entity.Locale == "ru_RU" {
			label = "Уровень"
		}
		add(fmt.Sprintf("%s %v–%v", label, bounds["min"], bounds["max"]))
	}
	if entity.Type == "currency" {
		for _, cap := range []struct{ key, en, ru string }{{"max_quantity", "Maximum", "Максимум"}, {"weekly_cap", "Weekly maximum", "Максимум в неделю"}} {
			if value, ok := facts[cap.key]; ok {
				label := cap.en
				if entity.Locale == "ru_RU" {
					label = cap.ru
				}
				add(fmt.Sprintf("%s: %v", label, value))
			}
		}
	}
	if entity.Type == "currency" {
		if category, ok := facts["currency_category"].(map[string]any); ok {
			if name, ok := category["Name_lang"].(string); ok {
				add(name)
			}
		}
	}
	if entity.Type == "faction" {
		technical := func(text string) bool { return strings.Contains(strings.ToLower(text), "npc faction only") }
		if technical(entity.Description) {
			entity.Description = ""
			entity.ResolvedDescription = ""
		}
		for locale, loc := range entity.Localizations {
			if technical(loc.Description) {
				loc.Description = ""
				loc.ResolvedDescription = ""
				entity.Localizations[locale] = loc
			}
		}
		if entity.Tooltip != nil {
			blocks := entity.Tooltip.Blocks[:0]
			for _, block := range entity.Tooltip.Blocks {
				text, _ := block["text"].(string)
				if !technical(text) {
					blocks = append(blocks, block)
				}
			}
			entity.Tooltip.Blocks = blocks
		}
	}
}

const worldContextSQL = `WITH RECURSIVE source AS (
 SELECT payload FROM catalog_db2_rows WHERE build_id=$1 AND table_name=$2 AND row_id=$3 AND locale='en_US'
), ancestry AS (
 SELECT r.row_id,r.payload,ARRAY[r.row_id] path,0 depth FROM catalog_db2_rows r
 WHERE $2='AreaTable' AND r.build_id=$1 AND r.table_name='AreaTable' AND r.locale='en_US' AND r.row_id=$3
 UNION ALL
 SELECT r.row_id,r.payload,a.path||r.row_id,a.depth+1 FROM ancestry a
 JOIN catalog_db2_rows r ON r.build_id=$1 AND r.table_name='AreaTable' AND r.locale='en_US'
 AND r.row_id::text=a.payload->>'ParentAreaID'
 WHERE NOT r.row_id=ANY(a.path) AND a.depth<32
), ui_ids AS (
 SELECT $3::bigint id WHERE $2='UiMap'
 UNION
 SELECT (a.payload->>'UiMapID')::bigint FROM catalog_db2_rows a WHERE a.build_id=$1 AND a.table_name='UiMapAssignment' AND a.locale='en_US'
 AND (($2='AreaTable' AND a.payload->>'AreaID' IN (SELECT row_id::text FROM ancestry))
 OR ($2='Map' AND a.payload->>'MapID'=$3::text)
 OR ($2='JournalInstance' AND a.payload->>'MapID'=(SELECT payload->>'MapID' FROM source)))
)
SELECT jsonb_build_object('source',COALESCE((SELECT payload FROM source),'{}'::jsonb),
 'ancestors',COALESCE((SELECT jsonb_agg(jsonb_build_object('area_id',a.row_id,'name',COALESCE(l.payload->>'AreaName_lang',a.payload->>'AreaName_lang'),'depth',a.depth) ORDER BY a.depth)
 FROM ancestry a LEFT JOIN catalog_db2_rows l ON l.build_id=$1 AND l.table_name='AreaTable' AND l.locale=$4 AND l.row_id=a.row_id WHERE a.depth>0),'[]'::jsonb),
 'ui_map_ids',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM ui_ids),'[]'::jsonb),
 'world_map',(SELECT jsonb_build_object('id',m.row_id,'name',COALESCE(NULLIF(lm.payload->>'MapName_lang',''),m.payload->>'MapName_lang'),'resolved_locale',CASE WHEN NULLIF(lm.payload->>'MapName_lang','') IS NOT NULL THEN $4 ELSE 'en_US' END)
 FROM catalog_db2_rows m LEFT JOIN catalog_db2_rows lm ON lm.build_id=m.build_id AND lm.table_name='Map' AND lm.row_id=m.row_id AND lm.locale=$4
 WHERE m.build_id=$1 AND m.table_name='Map' AND m.locale='en_US' AND m.row_id::text=CASE $2 WHEN 'AreaTable' THEN (SELECT payload->>'ContinentID' FROM source) WHEN 'JournalInstance' THEN (SELECT payload->>'MapID' FROM source) WHEN 'Map' THEN $3::text END),
 'content_tuning', (SELECT t.payload FROM catalog_db2_rows t WHERE t.build_id=$1 AND t.table_name='ContentTuning' AND t.locale='en_US' AND t.row_id::text=(SELECT payload->>'ContentTuningID' FROM source)),
 'currency_category',(SELECT c.payload FROM catalog_db2_rows c WHERE $2='CurrencyTypes' AND c.build_id=$1 AND c.table_name='CurrencyCategory' AND c.locale=$4 AND c.row_id::text=(SELECT payload->>'CategoryID' FROM source)),
 'paragon',(SELECT p.payload FROM catalog_db2_rows p WHERE $2='Faction' AND p.build_id=$1 AND p.table_name='ParagonReputation' AND p.locale='en_US' AND p.payload->>'FactionID' ~ '^[1-9][0-9]*$' AND p.payload->>'FactionID'=(SELECT payload->>'ParagonFactionID' FROM source)))`

//go:embed world_map_pictures.json
var worldMapPicturesJSON []byte

var worldMapPictures = func() map[string]map[string]any {
	var pictures map[string]map[string]any
	if err := json.Unmarshal(worldMapPicturesJSON, &pictures); err != nil {
		panic(err)
	}
	return pictures
}()
