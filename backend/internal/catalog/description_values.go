package catalog

import (
	"context"
	"fmt"
	"maps"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

var (
	spellDescriptionToken   = regexp.MustCompile(`\$@spelldesc(\d+)`)
	spellConditionalToken   = regexp.MustCompile(`\$\?([A-Za-z][A-Za-z0-9_|-]*)`)
	spellConditionalSpellID = regexp.MustCompile(`^[as]([0-9]+)$`)
	spellValueExpression    = regexp.MustCompile(`\$\{\$(\d*)s(\d+)(?:([/*+-])(\d+(?:\.\d+)?))?\}`)
	spellDurationToken      = regexp.MustCompile(`\$(\d+)d\b`)
	spellMaxDurationToken   = regexp.MustCompile(`\$(\d+)D\b`)
	spellEffectToken        = regexp.MustCompile(`\$(\d+)s(\d+)\b`)
	spellRadiusToken        = regexp.MustCompile(`\$[aA](\d*)\b`)
	spellRangeToken         = regexp.MustCompile(`\$[rR]\b`)
	spellTickToken          = regexp.MustCompile(`\$t(\d+)\b`)
	currentDurationToken    = regexp.MustCompile(`\$d\b`)
	currentMaxDurationToken = regexp.MustCompile(`\$D\b`)
	currentEffectToken      = regexp.MustCompile(`\$s(\d+)\b`)
)

type spellDescriptionValues struct {
	Name          string
	Description   string
	DurationMS    int64
	MaxDurationMS int64
	MinRange      float64
	MaxRange      float64
	Effects       map[int]spellEffectValue
}

type spellEffectValue struct {
	BasePoints             float64
	Coefficient            float64
	AttackPowerCoefficient float64
	AmplitudeMS            int64
	Radius                 float64
}

func (s *Service) resolveEntityDescriptions(ctx context.Context, entity *Entity) error {
	if entity == nil || entity.BuildID == nil {
		return nil
	}
	// Items can carry effect blocks whose text belongs to a referenced spell
	// (for example an on-use enchantment). Resolve those blocks too; without
	// this branch the public item tooltip keeps raw `$s1`/`$d` tokens even when
	// the spell's build-pinned values are available.
	if entity.Type != "spell" && entity.Type != "talent" && entity.Type != "pvp_talent" && entity.Tooltip == nil {
		return nil
	}
	if !entityHasDescriptionTemplates(entity) {
		return nil
	}
	if entity.RawDescription == "" {
		entity.RawDescription = entity.Description
	}
	currentSpellID := descriptionSpellID(*entity)
	// Resolve every stored locale independently. A requested Russian detail
	// page must not leave the English localization marked as display-ready (or
	// vice versa), and each locale can reference a different spell text.
	valuesByLocale := make(map[string]map[int64]spellDescriptionValues, 2)
	for _, locale := range []string{"en_US", "ru_RU"} {
		raw := ""
		if localized, ok := entity.Localizations[locale]; ok {
			raw = localized.Description
		}
		if raw == "" && locale == entity.Locale {
			raw = entity.Description
		}
		texts := []string{raw}
		if locale == entity.Locale && entity.Tooltip != nil {
			for _, block := range entity.Tooltip.Blocks {
				if text, ok := block["text"].(string); ok {
					texts = append(texts, text)
				}
			}
		}
		values, err := s.loadReferencedSpellDescriptionValues(ctx, entity.Product, locale, *entity.BuildID, currentSpellID, texts)
		if err != nil {
			return err
		}
		valuesByLocale[locale] = values
		if localized, ok := entity.Localizations[locale]; ok {
			localized.ResolvedDescription = resolveDescriptionText(localized.Description, currentSpellID, values, descriptionLocale(localized.Description, locale))
			entity.Localizations[locale] = localized
		}
	}

	values := valuesByLocale[entity.Locale]
	entity.Description = resolveDescriptionText(entity.Description, currentSpellID, values, descriptionLocale(entity.Description, entity.Locale))
	entity.ResolvedDescription = entity.Description
	if entity.Tooltip == nil {
		return nil
	}
	// The list and detail clients render Tooltip.PlainText directly. Keep it
	// in sync with the resolved description instead of exposing raw source
	// variables in the main tooltip paragraph. Effect blocks below are handled
	// separately because each block can refer to a different spell.
	entity.Tooltip.PlainText = resolveDescriptionText(entity.Tooltip.PlainText, currentSpellID, values, descriptionLocale(entity.Tooltip.PlainText, entity.Locale))
	for _, block := range entity.Tooltip.Blocks {
		raw, ok := block["text"].(string)
		if !ok || raw == "" {
			continue
		}
		blockSpellID := int64Value(block["spell_id"])
		blockValues := values
		if blockSpellID > 0 {
			// A block may use current-spell tokens (`$s1`, `$d`) without an
			// explicit ID in the text. Load the referenced spell as the current
			// context while retaining all values already discovered for nested
			// `$123s1`/`$@spelldesc123` expressions.
			loaded := map[int64]spellDescriptionValues(nil)
			var err error
			if _, alreadyLoaded := values[blockSpellID]; !alreadyLoaded {
				loaded, err = s.loadReferencedSpellDescriptionValues(ctx, entity.Product, entity.Locale, *entity.BuildID, blockSpellID, []string{raw})
			}
			if err != nil {
				return err
			}
			if len(loaded) > 0 {
				blockValues = make(map[int64]spellDescriptionValues, len(values)+len(loaded))
				maps.Copy(blockValues, values)
				maps.Copy(blockValues, loaded)
			}
		}
		resolved := resolveDescriptionText(raw, blockSpellIDOrDefault(blockSpellID, currentSpellID), blockValues, descriptionLocale(raw, entity.Locale))
		if resolved == raw {
			continue
		}
		block["raw_text"] = raw
		block["text"] = resolved
		block["resolution_source"] = "db2"
		entity.Tooltip.PlainText = strings.ReplaceAll(entity.Tooltip.PlainText, raw, resolved)
	}
	return nil
}

var descriptionTemplateToken = regexp.MustCompile(`\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])`)

func entityHasDescriptionTemplates(entity *Entity) bool {
	if entity == nil {
		return false
	}
	if descriptionTemplateToken.MatchString(entity.Description) {
		return true
	}
	for _, localized := range entity.Localizations {
		if descriptionTemplateToken.MatchString(localized.Description) {
			return true
		}
	}
	if entity.Tooltip != nil {
		for _, block := range entity.Tooltip.Blocks {
			if text, ok := block["text"].(string); ok && descriptionTemplateToken.MatchString(text) {
				return true
			}
		}
	}
	return false
}

func blockSpellIDOrDefault(blockSpellID, fallback int64) int64 {
	if blockSpellID > 0 {
		return blockSpellID
	}
	return fallback
}

func (s *Service) loadReferencedSpellDescriptionValues(ctx context.Context, product, locale string, buildID, currentSpellID int64, texts []string) (map[int64]spellDescriptionValues, error) {
	values := make(map[int64]spellDescriptionValues)
	pending := referencedSpellIDs(texts, currentSpellID)
	for depth := 0; depth < 4 && len(pending) > 0; depth++ {
		loaded, err := s.loadSpellDescriptionValues(ctx, product, locale, buildID, pending)
		if err != nil {
			return nil, err
		}
		maps.Copy(values, loaded)
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
	return values, nil
}

func (s *Service) loadSpellDescriptionValues(ctx context.Context, product, locale string, buildID int64, ids []int64) (map[int64]spellDescriptionValues, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT entity.external_id,
			COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,''),''),
			COALESCE(NULLIF(localized.description,''),NULLIF(fallback.description,''),''),
			COALESCE((
				SELECT (block->>'milliseconds')::bigint
				FROM catalog_entity_tooltips tooltip
				CROSS JOIN LATERAL jsonb_array_elements(tooltip.blocks) block
				WHERE tooltip.version_id=version.id AND tooltip.locale='en_US'
				  AND block->>'type'='duration'
				LIMIT 1
			),CASE WHEN duration.payload->>'Duration' ~ '^-?[0-9]+$'
				THEN (duration.payload->>'Duration')::bigint END,0),
			COALESCE(CASE WHEN duration.payload->>'MaxDuration' ~ '^-?[0-9]+$'
				THEN (duration.payload->>'MaxDuration')::bigint END,
				CASE WHEN duration.payload->>'Duration' ~ '^-?[0-9]+$'
					THEN (duration.payload->>'Duration')::bigint END,0),
			COALESCE(CASE WHEN spell_range.payload->>'RangeMin_0' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
				THEN (spell_range.payload->>'RangeMin_0')::double precision END,0),
			COALESCE(CASE WHEN spell_range.payload->>'RangeMax_0' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
				THEN (spell_range.payload->>'RangeMax_0')::double precision END,0),
			effect.effect_index,effect.base_points::double precision,
			effect.coefficient::double precision,effect.attack_power_coefficient::double precision,
			COALESCE(effect.amplitude_ms,0),
			COALESCE(CASE WHEN radius.payload->>'RadiusMax' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
				AND (radius.payload->>'RadiusMax')::double precision > 0
				THEN (radius.payload->>'RadiusMax')::double precision END,
				CASE WHEN radius.payload->>'Radius' ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
				THEN (radius.payload->>'Radius')::double precision END,0)
		FROM game_products product
		JOIN game_entities entity ON entity.product_id=product.id AND entity.entity_type='spell'
			AND entity.external_id=ANY($2::bigint[]) AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.latest_version_id AND version.build_id=$4
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$3
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		LEFT JOIN LATERAL (
			SELECT CASE WHEN misc.payload->>'DurationIndex' ~ '^[0-9]+$'
				THEN (misc.payload->>'DurationIndex')::bigint END AS duration_index,
				CASE WHEN misc.payload->>'RangeIndex' ~ '^[0-9]+$'
					THEN (misc.payload->>'RangeIndex')::bigint END AS range_index
			FROM catalog_db2_rows misc
			WHERE misc.build_id=version.build_id AND misc.table_name='SpellMisc' AND misc.locale='en_US'
			  AND misc.payload->>'SpellID' ~ '^[0-9]+$'
			  AND (misc.payload->>'SpellID')::bigint=entity.external_id
			ORDER BY (COALESCE(NULLIF(misc.payload->>'DifficultyID','')::int,0)=0) DESC,misc.row_id
			LIMIT 1
		) misc ON true
		LEFT JOIN catalog_db2_rows duration ON duration.build_id=version.build_id
			AND duration.table_name='SpellDuration' AND duration.locale='en_US'
			AND duration.row_id=misc.duration_index
		LEFT JOIN catalog_db2_rows spell_range ON spell_range.build_id=version.build_id
			AND spell_range.table_name='SpellRange' AND spell_range.locale='en_US'
			AND spell_range.row_id=misc.range_index
		LEFT JOIN catalog_spell_effects effect ON effect.spell_version_id=version.id
			AND effect.difficulty_id=0 AND effect.source='db2'
		LEFT JOIN LATERAL (
			SELECT COALESCE(
				CASE WHEN effect.attributes->>'radius_index_1' ~ '^[0-9]+$'
					THEN (effect.attributes->>'radius_index_1')::bigint END,
				CASE WHEN effect.attributes->>'radius_index_0' ~ '^[0-9]+$'
					THEN (effect.attributes->>'radius_index_0')::bigint END,
				(SELECT COALESCE(
					CASE WHEN raw.payload->>'EffectRadiusIndex_1' ~ '^[0-9]+$'
						THEN (raw.payload->>'EffectRadiusIndex_1')::bigint END,
					CASE WHEN raw.payload->>'EffectRadiusIndex_0' ~ '^[0-9]+$'
						THEN (raw.payload->>'EffectRadiusIndex_0')::bigint END)
				 FROM catalog_db2_rows raw
				 WHERE raw.build_id=version.build_id AND raw.table_name='SpellEffect' AND raw.locale='en_US'
				   AND raw.payload->>'SpellID'=entity.external_id::text
				   AND raw.payload->>'EffectIndex'=effect.effect_index::text
				 ORDER BY (COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0)=0) DESC,raw.row_id
				 LIMIT 1)
			) AS radius_ref(radius_index) ON true
		LEFT JOIN catalog_db2_rows radius ON radius.build_id=version.build_id
			AND radius.table_name='SpellRadius' AND radius.locale='en_US'
			AND radius.row_id=radius_ref.radius_index
		WHERE product.slug=$1
		ORDER BY entity.external_id,effect.effect_index`, product, ids, normalizeLocale(locale), buildID)
	if err != nil {
		return nil, fmt.Errorf("load spell description values: %w", err)
	}
	defer rows.Close()
	result := make(map[int64]spellDescriptionValues, len(ids))
	for rows.Next() {
		var id, duration, maxDuration int64
		var name, description string
		var minRange, maxRange float64
		var effectIndex *int16
		var basePoints, coefficient, attackPowerCoefficient *float64
		var amplitude int64
		var radius *float64
		if err := rows.Scan(&id, &name, &description, &duration, &maxDuration, &minRange, &maxRange, &effectIndex, &basePoints, &coefficient, &attackPowerCoefficient, &amplitude, &radius); err != nil {
			return nil, fmt.Errorf("scan spell description values: %w", err)
		}
		value := result[id]
		value.Name, value.Description, value.DurationMS, value.MaxDurationMS = name, description, duration, maxDuration
		value.MinRange, value.MaxRange = minRange, maxRange
		if value.Effects == nil {
			value.Effects = make(map[int]spellEffectValue)
		}
		if effectIndex != nil {
			value.Effects[int(*effectIndex)+1] = spellEffectValue{
				BasePoints:             pointerFloat(basePoints),
				Coefficient:            pointerFloat(coefficient),
				AttackPowerCoefficient: pointerFloat(attackPowerCoefficient),
				AmplitudeMS:            amplitude,
				Radius:                 pointerFloat(radius),
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
		for _, expression := range []*regexp.Regexp{spellDescriptionToken, spellDurationToken, spellMaxDurationToken, spellEffectToken, spellValueExpression} {
			for _, match := range expression.FindAllStringSubmatch(text, -1) {
				if len(match) < 2 || match[1] == "" {
					continue
				}
				if id, err := strconv.ParseInt(match[1], 10, 64); err == nil && id > 0 {
					unique[id] = struct{}{}
				}
			}
		}
		for _, match := range spellConditionalToken.FindAllStringSubmatch(text, -1) {
			if len(match) != 2 {
				continue
			}
			if id, ok := conditionalSpellID(match[1]); ok {
				unique[id] = struct{}{}
			}
		}
	}
	ids := make([]int64, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}

func resolveDescriptionText(text string, currentSpellID int64, values map[int64]spellDescriptionValues, locale string) string {
	if text == "" {
		return text
	}
	text = resolveConditionalDescriptionTokens(text, currentSpellID, values, locale)
	for range 4 {
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
		index, _ := strconv.Atoi(match[2])
		value, ok := spellEffectValueAt(values[id].Effects, index)
		if !ok {
			return token
		}
		operand := 0.0
		if match[4] != "" {
			operand, _ = strconv.ParseFloat(match[4], 64)
		}
		if formatted, resolved := formatSpellEffect(value, match[3], operand); resolved {
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
	text = spellMaxDurationToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellMaxDurationToken.FindStringSubmatch(token)
		id, _ := strconv.ParseInt(match[1], 10, 64)
		if duration := values[id].MaxDurationMS; duration != 0 {
			return formatDescriptionDuration(duration, locale)
		}
		return token
	})
	text = spellEffectToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellEffectToken.FindStringSubmatch(token)
		id, _ := strconv.ParseInt(match[1], 10, 64)
		index, _ := strconv.Atoi(match[2])
		if value, ok := spellEffectValueAt(values[id].Effects, index); ok {
			if formatted, resolved := formatSpellEffect(value, "", 0); resolved {
				return formatted
			}
		}
		return token
	})
	text = spellRadiusToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellRadiusToken.FindStringSubmatch(token)
		index := 1
		if match[1] != "" {
			parsed, err := strconv.Atoi(match[1])
			if err != nil || parsed < 1 {
				return token
			}
			index = parsed
		}
		if value, ok := spellEffectValueAt(values[currentSpellID].Effects, index); ok && value.Radius > 0 {
			return formatDescriptionNumber(value.Radius)
		}
		return token
	})
	text = spellRangeToken.ReplaceAllStringFunc(text, func(token string) string {
		if currentSpellID > 0 {
			if value := values[currentSpellID]; value.MaxRange > 0 {
				return formatDescriptionNumber(value.MaxRange)
			}
			if value := values[currentSpellID]; value.MinRange > 0 {
				return formatDescriptionNumber(value.MinRange)
			}
		}
		return token
	})
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
			if value, ok := spellEffectValueAt(values[currentSpellID].Effects, index); ok {
				if formatted, resolved := formatSpellEffect(value, "", 0); resolved {
					return formatted
				}
			}
			return token
		})
		text = currentMaxDurationToken.ReplaceAllStringFunc(text, func(token string) string {
			if duration := values[currentSpellID].MaxDurationMS; duration != 0 {
				return formatDescriptionDuration(duration, locale)
			}
			return token
		})
	}
	text = spellTickToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellTickToken.FindStringSubmatch(token)
		index, _ := strconv.Atoi(match[1])
		if value, ok := spellEffectValueAt(values[currentSpellID].Effects, index); ok && value.AmplitudeMS > 0 {
			return formatDescriptionDuration(value.AmplitudeMS, locale)
		}
		return token
	})
	return text
}

// spellEffectValueAt converts the one-based effect references used by
// Blizzard description templates ($s1, $s2, $A1, …) to the zero-based
// EffectIndex values stored in DB2. A few legacy/imported payloads already
// contain one-based indexes; when no index 0 is present we retain that shape
// as a compatibility fallback instead of silently changing their meaning.
func spellEffectValueAt(effects map[int]spellEffectValue, oneBasedIndex int) (spellEffectValue, bool) {
	if oneBasedIndex < 1 || len(effects) == 0 {
		return spellEffectValue{}, false
	}
	if _, zeroBased := effects[0]; zeroBased {
		if value, ok := effects[oneBasedIndex-1]; ok {
			return value, true
		}
		// Keep a defensive fallback for sparse legacy payloads whose first
		// persisted effect is zero-based but later entries were normalized as
		// one-based. It is safer to render a proved value than to leak a raw
		// template token when the canonical slot is absent.
		value, ok := effects[oneBasedIndex]
		return value, ok
	}
	value, ok := effects[oneBasedIndex]
	return value, ok
}

// resolveConditionalDescriptionTokens keeps both branches of a Blizzard
// conditional in the public text. The active branch depends on a player's
// known spell/aura and cannot be selected from static DB2 data, so silently
// choosing one would make the catalog factually wrong. The source condition
// is still made readable and branch contents continue through normal value
// substitution below.
func resolveConditionalDescriptionTokens(text string, currentSpellID int64, values map[int64]spellDescriptionValues, locale string) string {
	for {
		start := strings.Index(text, "$?")
		if start < 0 {
			return text
		}
		match := spellConditionalToken.FindStringSubmatch(text[start:])
		if len(match) != 2 {
			return text
		}
		prefixLen := len(match[0])
		open := start + prefixLen
		if open >= len(text) || text[open] != '[' {
			return text
		}
		trueText, next, ok := bracketText(text, open)
		if !ok || next >= len(text) || text[next] != '[' {
			return text
		}
		falseText, end, ok := bracketText(text, next)
		if !ok {
			return text
		}
		condition := match[1]
		trueText = resolveConditionalDescriptionTokens(trueText, currentSpellID, values, locale)
		falseText = resolveConditionalDescriptionTokens(falseText, currentSpellID, values, locale)
		trueText = resolveDescriptionTextWithoutConditionals(trueText, currentSpellID, values, locale)
		falseText = resolveDescriptionTextWithoutConditionals(falseText, currentSpellID, values, locale)
		label := conditionalLabel(condition, values)
		replacement := formatConditionalDescription(label, trueText, falseText, locale)
		if start > 0 {
			previous := rune(text[start-1])
			if !unicode.IsSpace(previous) && previous != '(' && previous != '[' {
				replacement = " " + replacement
			}
		}
		text = text[:start] + replacement + text[end:]
	}
}

func conditionalSpellID(condition string) (int64, bool) {
	match := spellConditionalSpellID.FindStringSubmatch(strings.ToLower(strings.TrimSpace(condition)))
	if len(match) != 2 {
		return 0, false
	}
	id, err := strconv.ParseInt(match[1], 10, 64)
	return id, err == nil && id > 0
}

func conditionalLabel(condition string, values map[int64]spellDescriptionValues) string {
	condition = strings.TrimSpace(condition)
	if id, ok := conditionalSpellID(condition); ok {
		if value := values[id]; value.Name != "" {
			return value.Name
		}
		return fmt.Sprintf("spell #%d", id)
	}
	return "condition " + condition
}

func resolveDescriptionTextWithoutConditionals(text string, currentSpellID int64, values map[int64]spellDescriptionValues, locale string) string {
	// Branches can contain ordinary DB2 variables. Calling the full resolver
	// would recurse into this function only when another conditional exists;
	// those nested conditionals were already handled above.
	return spellDescriptionToken.ReplaceAllStringFunc(text, func(token string) string {
		match := spellDescriptionToken.FindStringSubmatch(token)
		id, _ := strconv.ParseInt(match[1], 10, 64)
		if value := values[id]; value.Description != "" && value.Description != token {
			return value.Description
		}
		return token
	})
}

func bracketText(text string, open int) (string, int, bool) {
	if open < 0 || open >= len(text) || text[open] != '[' {
		return "", open, false
	}
	depth := 0
	for index := open; index < len(text); index++ {
		switch text[index] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return text[open+1 : index], index + 1, true
			}
		}
	}
	return "", open, false
}

func formatConditionalDescription(label, trueText, falseText, locale string) string {
	switch {
	case trueText != "" && falseText != "":
		if locale == "ru_RU" {
			return fmt.Sprintf("Если доступно «%s»: %s; иначе: %s", label, trueText, falseText)
		}
		return fmt.Sprintf("If «%s»: %s; otherwise: %s", label, trueText, falseText)
	case trueText != "":
		if locale == "ru_RU" {
			return fmt.Sprintf("Если доступно «%s»: %s", label, trueText)
		}
		return fmt.Sprintf("If «%s»: %s", label, trueText)
	case falseText != "":
		if locale == "ru_RU" {
			return fmt.Sprintf("Если недоступно «%s»: %s", label, falseText)
		}
		return fmt.Sprintf("If «%s» is unavailable: %s", label, falseText)
	default:
		return ""
	}
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
