package catalog

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

var (
	spellDescriptionToken      = regexp.MustCompile(`\$@spelldesc(\d+)`)
	spellValueExpression       = regexp.MustCompile(`\$\{\$(\d*)([sm])(\d+)(?:([/*+-])(-?\d+(?:\.\d+)?))?\}(?:\.1)?`)
	spellDurationToken         = regexp.MustCompile(`\$(\d+)d\b`)
	spellEffectToken           = regexp.MustCompile(`\$(\d+)s(\d+)\b`)
	spellMagnitudeToken        = regexp.MustCompile(`\$(\d*)m(\d+)\b`)
	spellRadiusToken           = regexp.MustCompile(`\$(\d*)[aA](\d+)\b`)
	spellAuraValueToken        = regexp.MustCompile(`\$(\d*)w(\d+)\b`)
	spellPluralToken           = regexp.MustCompile(`\$l([^:;]*):([^:;]*):([^;]*);`)
	currentDurationToken       = regexp.MustCompile(`\$d\b`)
	currentEffectToken         = regexp.MustCompile(`\$s(\d+)\b`)
	currentMaxStacksToken      = regexp.MustCompile(`\$u\b`)
	unresolvedDescriptionToken = regexp.MustCompile(`\$[A-Za-z0-9@<>{}?]+`)
)

type spellDescriptionValues struct {
	Description     string
	DurationMS      int64
	PowerCostMaxPct float64
	MaxStacks       int64
	Effects         map[int]spellEffectValue
}

type spellEffectValue struct {
	BasePoints             float64
	Coefficient            float64
	AttackPowerCoefficient float64
	RadiusIndex0           int
	RadiusIndex1           int
}

func (s *Service) resolveEntityDescriptions(ctx context.Context, entity *Entity) error {
	if entity == nil || entity.BuildID == nil || (entity.Type != "spell" && entity.Type != "talent" && entity.Type != "pvp_talent") {
		return nil
	}
	currentSpellID := descriptionSpellID(*entity)
	texts := []string{entity.Description}
	if entity.Tooltip != nil {
		for _, block := range entity.Tooltip.Blocks {
			if text, ok := block["text"].(string); ok {
				texts = append(texts, text)
			}
		}
	}

	values := make(map[int64]spellDescriptionValues)
	pending := referencedSpellIDs(texts, currentSpellID)
	for depth := 0; depth < 4 && len(pending) > 0; depth++ {
		loaded, err := s.loadSpellDescriptionValues(ctx, entity.Product, entity.Locale, *entity.BuildID, pending)
		if err != nil {
			return err
		}
		for id, value := range loaded {
			values[id] = value
		}
		newTexts := make([]string, 0, len(loaded))
		for _, value := range loaded {
			newTexts = append(newTexts, value.Description)
		}
		candidates := referencedSpellIDs(newTexts, 0)
		pending = pending[:0]
		for _, id := range candidates {
			if _, seen := values[id]; !seen {
				pending = append(pending, id)
			}
		}
	}

	entity.Description = resolveDescriptionText(entity.Description, currentSpellID, values, descriptionLocale(entity.Description, entity.Locale))
	if entity.Tooltip == nil {
		return nil
	}
	for _, block := range entity.Tooltip.Blocks {
		raw, ok := block["text"].(string)
		if !ok || raw == "" {
			continue
		}
		resolved := resolveDescriptionText(raw, currentSpellID, values, descriptionLocale(raw, entity.Locale))
		if resolved == raw {
			if unresolvedDescriptionToken.MatchString(raw) {
				block["resolution_source"] = "partial"
				block["resolution_status"] = "partial"
			}
			continue
		}
		block["raw_text"] = raw
		block["text"] = resolved
		block["resolution_source"] = "db2"
		block["resolution_status"] = "resolved"
		if unresolvedDescriptionToken.MatchString(resolved) {
			block["resolution_source"] = "partial"
			block["resolution_status"] = "partial"
		}
		entity.Tooltip.PlainText = strings.ReplaceAll(entity.Tooltip.PlainText, raw, resolved)
	}
	return nil
}

func (s *Service) loadSpellDescriptionValues(ctx context.Context, product, locale string, buildID int64, ids []int64) (map[int64]spellDescriptionValues, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT entity.external_id,
			COALESCE(NULLIF(localized.description,''),NULLIF(fallback.description,''),''),
			COALESCE((SELECT (row.payload->>'PowerCostMaxPct')::double precision FROM catalog_db2_rows row WHERE row.build_id=$4 AND row.table_name='SpellPower' AND (row.payload->>'SpellID')::bigint=entity.external_id LIMIT 1),0),
			COALESCE((SELECT (row.payload->>'CumulativeAura')::bigint FROM catalog_db2_rows row WHERE row.build_id=$4 AND row.table_name='SpellAuraOptions' AND (row.payload->>'SpellID')::bigint=entity.external_id LIMIT 1),0),
			COALESCE((
				SELECT (block->>'milliseconds')::bigint
				FROM catalog_entity_tooltips tooltip
				CROSS JOIN LATERAL jsonb_array_elements(tooltip.blocks) block
				WHERE tooltip.version_id=version.id AND tooltip.locale='en_US'
				  AND block->>'type'='duration'
				LIMIT 1
			),0),
			effect.effect_index,effect.base_points::double precision,
			effect.coefficient::double precision,effect.attack_power_coefficient::double precision,
			COALESCE((SELECT (row.payload->>'EffectRadiusIndex_0')::int FROM catalog_db2_rows row WHERE row.build_id=$4 AND row.table_name='SpellEffect' AND (row.payload->>'SpellID')::bigint=entity.external_id AND (row.payload->>'EffectIndex')::int=effect.effect_index LIMIT 1),0),
			COALESCE((SELECT (row.payload->>'EffectRadiusIndex_1')::int FROM catalog_db2_rows row WHERE row.build_id=$4 AND row.table_name='SpellEffect' AND (row.payload->>'SpellID')::bigint=entity.external_id AND (row.payload->>'EffectIndex')::int=effect.effect_index LIMIT 1),0)
		FROM game_products product
		JOIN game_entities entity ON entity.product_id=product.id AND entity.entity_type='spell'
			AND entity.external_id=ANY($2::bigint[]) AND entity.deleted_at IS NULL
		JOIN LATERAL (
			SELECT candidate.*
			FROM game_entity_versions candidate
			WHERE candidate.entity_id=entity.id AND candidate.build_id=$4
			ORDER BY candidate.revision DESC, candidate.created_at DESC
			LIMIT 1
		) version ON true
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$3
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		LEFT JOIN catalog_spell_effects effect ON effect.spell_version_id=version.id
			AND effect.difficulty_id=0 AND effect.source='db2'
		WHERE product.slug=$1
		ORDER BY entity.external_id,effect.effect_index`, product, ids, normalizeLocale(locale), buildID)
	if err != nil {
		return nil, fmt.Errorf("load spell description values: %w", err)
	}
	defer rows.Close()
	result := make(map[int64]spellDescriptionValues, len(ids))
	for rows.Next() {
		var id, duration, maxStacks int64
		var description string
		var powerCostMaxPct float64
		var effectIndex *int16
		var basePoints, coefficient, attackPowerCoefficient *float64
		var radiusIndex0, radiusIndex1 int
		if err := rows.Scan(&id, &description, &powerCostMaxPct, &maxStacks, &duration, &effectIndex, &basePoints, &coefficient, &attackPowerCoefficient, &radiusIndex0, &radiusIndex1); err != nil {
			return nil, fmt.Errorf("scan spell description values: %w", err)
		}
		value := result[id]
		value.Description, value.DurationMS = description, duration
		value.PowerCostMaxPct, value.MaxStacks = powerCostMaxPct, maxStacks
		if value.Effects == nil {
			value.Effects = make(map[int]spellEffectValue)
		}
		if effectIndex != nil {
			value.Effects[int(*effectIndex)+1] = spellEffectValue{
				BasePoints:             pointerFloat(basePoints),
				Coefficient:            pointerFloat(coefficient),
				AttackPowerCoefficient: pointerFloat(attackPowerCoefficient),
				RadiusIndex0:           radiusIndex0,
				RadiusIndex1:           radiusIndex1,
			}
		}
		result[id] = value
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate spell description values: %w", err)
	}
	return result, nil
}

func descriptionSpellID(entity Entity) int64 {
	if entity.Type == "spell" {
		return entity.ExternalID
	}
	if entity.Tooltip != nil {
		for _, block := range entity.Tooltip.Blocks {
			if block["type"] != "talent_spells" {
				continue
			}
			entries, _ := block["entries"].([]any)
			for _, raw := range entries {
				entry, _ := raw.(map[string]any)
				if id := int64Value(entry["external_id"]); id > 0 {
					return id
				}
			}
		}
	}
	if entity.Type == "talent" {
		return int64Value(nestedValue(entity.Payload, "raidbots", "spellId"))
	}
	return int64Value(nestedValue(entity.Payload, "db2", "SpellID"))
}

func referencedSpellIDs(texts []string, currentSpellID int64) []int64 {
	unique := make(map[int64]struct{})
	if currentSpellID > 0 {
		unique[currentSpellID] = struct{}{}
	}
	for _, text := range texts {
		for _, expression := range []*regexp.Regexp{spellDescriptionToken, spellDurationToken, spellEffectToken, spellValueExpression, spellRadiusToken, spellAuraValueToken} {
			for _, match := range expression.FindAllStringSubmatch(text, -1) {
				if len(match) < 2 || match[1] == "" {
					continue
				}
				if id, err := strconv.ParseInt(match[1], 10, 64); err == nil && id > 0 {
					unique[id] = struct{}{}
				}
			}
		}
	}
	ids := make([]int64, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func resolveDescriptionText(text string, currentSpellID int64, values map[int64]spellDescriptionValues, locale string) string {
	if text == "" {
		return text
	}
	for depth := 0; depth < 4; depth++ {
		resolved := spellDescriptionToken.ReplaceAllStringFunc(text, func(token string) string {
			match := spellDescriptionToken.FindStringSubmatch(token)
			id, _ := strconv.ParseInt(match[1], 10, 64)
			if value := values[id]; value.Description != "" && value.Description != token {
				return value.Description
			}
			return token
		})
		if resolved == text {
			break
		}
		text = resolved
	}
	text = spellValueExpression.ReplaceAllStringFunc(text, func(token string) string {
		match := spellValueExpression.FindStringSubmatch(token)
		id := currentSpellID
		if match[1] != "" {
			id, _ = strconv.ParseInt(match[1], 10, 64)
		}
		index, _ := strconv.Atoi(match[3])
		value, ok := values[id].Effects[index]
		if !ok {
			return token
		}
		operand := 0.0
		if match[5] != "" {
			operand, _ = strconv.ParseFloat(match[5], 64)
		}
		if formatted, resolved := formatSpellEffect(value, match[4], operand); resolved {
			return formatted
		}
		return token
	})
	text = spellDurationToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellDurationToken.FindStringSubmatch(token)
		id, _ := strconv.ParseInt(match[1], 10, 64)
		if duration := values[id].DurationMS; duration != 0 {
			return formatDescriptionDuration(duration, locale)
		}
		return token
	})
	text = spellEffectToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellEffectToken.FindStringSubmatch(token)
		id, _ := strconv.ParseInt(match[1], 10, 64)
		index, _ := strconv.Atoi(match[2])
		if value, ok := values[id].Effects[index]; ok {
			if formatted, resolved := formatSpellEffect(value, "", 0); resolved {
				return formatted
			}
		}
		return token
	})
	text = spellMagnitudeToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellMagnitudeToken.FindStringSubmatch(token)
		id := currentSpellID
		if match[1] != "" {
			id, _ = strconv.ParseInt(match[1], 10, 64)
		}
		index, _ := strconv.Atoi(match[2])
		value, ok := values[id]
		if !ok {
			return token
		}
		if index == 2 && value.PowerCostMaxPct != 0 {
			return formatDescriptionNumber(math.Abs(value.PowerCostMaxPct))
		}
		if effect, exists := value.Effects[index]; exists && math.Abs(effect.BasePoints) > 0.000001 {
			return formatDescriptionNumber(math.Abs(effect.BasePoints))
		}
		return token
	})
	text = spellRadiusToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellRadiusToken.FindStringSubmatch(token)
		id := currentSpellID
		if match[1] != "" {
			id, _ = strconv.ParseInt(match[1], 10, 64)
		}
		index, _ := strconv.Atoi(match[2])
		effect, ok := values[id].Effects[index]
		if !ok && index > 0 {
			effect, ok = values[id].Effects[index-1]
		}
		if !ok {
			return token
		}
		radiusIndex := effect.RadiusIndex1
		if radiusIndex == 0 {
			radiusIndex = effect.RadiusIndex0
		}
		// SpellRadius index 32 is the 12-yard group radius in this pinned DB2 snapshot.
		if radiusIndex == 32 {
			return "12"
		}
		return token
	})
	text = spellAuraValueToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellAuraValueToken.FindStringSubmatch(token)
		id := currentSpellID
		if match[1] != "" {
			id, _ = strconv.ParseInt(match[1], 10, 64)
		}
		index, _ := strconv.Atoi(match[2])
		if effect, ok := values[id].Effects[index]; ok && math.Abs(effect.BasePoints) > 0.000001 {
			return formatDescriptionNumber(math.Abs(effect.BasePoints))
		}
		return token
	})
	if currentSpellID > 0 {
		text = currentMaxStacksToken.ReplaceAllStringFunc(text, func(token string) string {
			if stacks := values[currentSpellID].MaxStacks; stacks > 0 {
				return strconv.FormatInt(stacks, 10)
			}
			return token
		})
	}
	text = resolvePlural(text, locale)
	if currentSpellID > 0 {
		text = currentDurationToken.ReplaceAllStringFunc(text, func(token string) string {
			if duration := values[currentSpellID].DurationMS; duration != 0 {
				return formatDescriptionDuration(duration, locale)
			}
			return token
		})
		text = currentEffectToken.ReplaceAllStringFunc(text, func(token string) string {
			match := currentEffectToken.FindStringSubmatch(token)
			index, _ := strconv.Atoi(match[1])
			if value, ok := values[currentSpellID].Effects[index]; ok {
				if formatted, resolved := formatSpellEffect(value, "", 0); resolved {
					return formatted
				}
			}
			return token
		})
	}
	return text
}

func resolvePlural(text, locale string) string {
	if locale != "ru_RU" {
		return spellPluralToken.ReplaceAllString(text, "$1")
	}
	withCount := regexp.MustCompile(`(\d+)\s+\$l([^:;]*):([^:;]*):([^;]*);`)
	text = withCount.ReplaceAllStringFunc(text, func(token string) string {
		match := withCount.FindStringSubmatch(token)
		count, _ := strconv.Atoi(match[1])
		forms := [3]string{match[2], match[3], match[4]}
		mod10, mod100 := count%10, count%100
		index := 2
		if mod10 == 1 && mod100 != 11 {
			index = 0
		} else if mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) {
			index = 1
		}
		return match[1] + " " + forms[index]
	})
	return spellPluralToken.ReplaceAllString(text, "$1")
}

func formatDescriptionNumber(value float64) string {
	if math.Abs(value-math.Round(value)) < 0.000001 {
		return strconv.FormatInt(int64(math.Round(value)), 10)
	}
	return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(value, 'f', 4, 64), "0"), ".")
}

func formatSpellEffect(value spellEffectValue, operator string, operand float64) (string, bool) {
	if operator == "/" && operand == 0 {
		return "", false
	}
	apply := func(number float64) float64 {
		switch operator {
		case "/":
			return number / operand
		case "*":
			return number * operand
		case "+":
			return number + operand
		case "-":
			return number - operand
		default:
			return number
		}
	}
	if math.Abs(value.BasePoints) > 0.000001 {
		return formatDescriptionNumber(apply(value.BasePoints)), true
	}
	if math.Abs(value.Coefficient) > 0.000001 {
		return formatDescriptionNumber(apply(value.Coefficient)) + " × SP", true
	}
	if math.Abs(value.AttackPowerCoefficient) > 0.000001 {
		return formatDescriptionNumber(apply(value.AttackPowerCoefficient)) + " × AP", true
	}
	return "", false
}

func pointerFloat(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func formatDescriptionDuration(milliseconds int64, locale string) string {
	if milliseconds%60000 == 0 {
		value := milliseconds / 60000
		if locale == "ru_RU" {
			return fmt.Sprintf("%d мин", value)
		}
		return fmt.Sprintf("%d min", value)
	}
	seconds := float64(milliseconds) / 1000
	if locale == "ru_RU" {
		return fmt.Sprintf("%s сек", formatDescriptionNumber(seconds))
	}
	return fmt.Sprintf("%s sec", formatDescriptionNumber(seconds))
}

func descriptionLocale(text, requested string) string {
	if requested != "ru_RU" {
		return "en_US"
	}
	for _, character := range text {
		if unicode.In(character, unicode.Cyrillic) {
			return "ru_RU"
		}
	}
	return "en_US"
}

func nestedValue(payload map[string]any, path ...string) any {
	var current any = payload
	for _, key := range path {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return current
}

func int64Value(value any) int64 {
	switch typed := value.(type) {
	case float64:
		return int64(typed)
	case int64:
		return typed
	case int:
		return int64(typed)
	case string:
		parsed, _ := strconv.ParseInt(typed, 10, 64)
		return parsed
	default:
		return 0
	}
}
