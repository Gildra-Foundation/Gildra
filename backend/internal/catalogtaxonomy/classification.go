package catalogtaxonomy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (i *Indexer) definitions(ctx context.Context, tx pgx.Tx) ([]Definition, error) {
	definitions, err := itemTaxonomyDefinitions(ctx, tx)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT
			(v.payload #>> '{raidbots,classId}')::bigint,
			v.payload #>> '{raidbots,className}',
			e.external_id,
			v.payload #>> '{raidbots,specName}'
		FROM game_entities e
		JOIN game_entity_versions v ON v.id = e.latest_version_id
		WHERE e.entity_type = 'talent_tree' AND e.deleted_at IS NULL
		  AND v.payload #>> '{raidbots,classId}' <> ''
		ORDER BY 1, 3`)
	if err != nil {
		return nil, fmt.Errorf("read class taxonomy: %w", err)
	}
	defer rows.Close()
	seenClasses := make(map[int64]struct{})
	for rows.Next() {
		var classID, specID int64
		var className, specName string
		if err := rows.Scan(&classID, &className, &specID, &specName); err != nil {
			return nil, fmt.Errorf("scan class taxonomy: %w", err)
		}
		classSlug := slugify(className)
		specSlug := slugify(specName)
		for _, entityType := range []string{"spell", "talent", "pvp_talent", "talent_tree"} {
			rootPath := "classes"
			definitions = appendUnique(definitions, Definition{
				EntityType: entityType, Facet: "group", Slug: "classes", Path: rootPath,
				NameEN: "Classes", NameRU: "Классы", SortOrder: 10,
			})
			if _, exists := seenClasses[classID]; !exists || entityType != "spell" {
				definitions = appendUnique(definitions, Definition{
					EntityType: entityType, Facet: "class", Slug: classSlug, Path: rootPath + "/" + classSlug,
					ParentPath: rootPath, NameEN: className, NameRU: localizedClass(className),
					SortOrder: int16(classID), Attributes: map[string]any{"class_id": classID},
				})
			}
			definitions = appendUnique(definitions, Definition{
				EntityType: entityType, Facet: "specialization", Slug: specSlug,
				Path: rootPath + "/" + classSlug + "/" + specSlug, ParentPath: rootPath + "/" + classSlug,
				NameEN: specName, NameRU: localizedSpecialization(specName), SortOrder: int16(specID),
				Attributes: map[string]any{"class_id": classID, "spec_id": specID},
			})
		}
		seenClasses[classID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate class taxonomy: %w", err)
	}
	raceRows, err := tx.Query(ctx, `
		SELECT en.payload->>'Name_lang',COALESCE(NULLIF(ru.payload->>'Name_lang',''),en.payload->>'Name_lang'),
			array_agg((en.payload->>'PlayableRaceBit')::bigint ORDER BY (en.payload->>'PlayableRaceBit')::bigint),MIN(en.row_id)
		FROM catalog_db2_rows en
		JOIN game_builds b ON b.id=en.build_id AND b.is_active
		LEFT JOIN catalog_db2_rows ru ON ru.build_id=en.build_id AND ru.table_name='ChrRaces' AND ru.locale='ru_RU' AND ru.row_id=en.row_id
		WHERE en.table_name='ChrRaces' AND en.locale='en_US' AND (en.payload->>'PlayableRaceBit')::int>=0
		  AND en.payload->>'Name_lang' NOT LIKE 'TBD%'
		GROUP BY en.payload->>'Name_lang',COALESCE(NULLIF(ru.payload->>'Name_lang',''),en.payload->>'Name_lang')
		ORDER BY MIN(en.row_id)`)
	if err != nil {
		return nil, fmt.Errorf("read race taxonomy: %w", err)
	}
	defer raceRows.Close()
	definitions = appendUnique(definitions, Definition{EntityType: "spell", Facet: "group", Slug: "races", Path: "races", NameEN: "Races", NameRU: "Расы", SortOrder: 20})
	for raceRows.Next() {
		var nameEN, nameRU string
		var bits []int64
		var sortOrder int64
		if err := raceRows.Scan(&nameEN, &nameRU, &bits, &sortOrder); err != nil {
			return nil, fmt.Errorf("scan race taxonomy: %w", err)
		}
		slug := slugify(nameEN)
		definitions = appendUnique(definitions, Definition{
			EntityType: "spell", Facet: "race", Slug: slug, Path: "races/" + slug, ParentPath: "races",
			NameEN: nameEN, NameRU: nameRU, SortOrder: int16(sortOrder), Attributes: map[string]any{"race_bits": bits},
		})
	}
	if err := raceRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate race taxonomy: %w", err)
	}
	professionRows, err := tx.Query(ctx, `
		SELECT profession.skill_line_id,en.name,COALESCE(NULLIF(ru.name,''),en.name),entity.external_id
		FROM catalog_professions profession
		JOIN game_entity_versions version ON version.id=profession.version_id
		JOIN game_entities entity ON entity.latest_version_id=version.id
		JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
		LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
		WHERE entity.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM catalog_profession_recipes recipe WHERE recipe.profession_version_id=profession.version_id)
		ORDER BY entity.external_id`)
	if err != nil {
		return nil, fmt.Errorf("read profession recipe taxonomy: %w", err)
	}
	defer professionRows.Close()
	definitions = appendUnique(definitions, Definition{EntityType: "recipe", Facet: "group", Slug: "professions", Path: "professions", NameEN: "Professions & Crafting", NameRU: "Профессии и ремесло", SortOrder: 30})
	for professionRows.Next() {
		var skillLineID, sortOrder int64
		var nameEN, nameRU string
		if err := professionRows.Scan(&skillLineID, &nameEN, &nameRU, &sortOrder); err != nil {
			return nil, fmt.Errorf("scan profession recipe taxonomy: %w", err)
		}
		slug := slugify(nameEN)
		definitions = appendUnique(definitions, Definition{EntityType: "recipe", Facet: "profession", Slug: slug,
			Path: "professions/" + slug, ParentPath: "professions", NameEN: nameEN, NameRU: nameRU,
			SortOrder: int16(sortOrder), Attributes: map[string]any{"skill_line_id": skillLineID}})
	}
	if err := professionRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate profession recipe taxonomy: %w", err)
	}
	collectionDefinitions, err := collectionTaxonomyDefinitions(ctx, tx)
	if err != nil {
		return nil, err
	}
	for _, definition := range collectionDefinitions {
		definitions = appendUnique(definitions, definition)
	}
	return definitions, nil
}

func collectionTaxonomyDefinitions(ctx context.Context, tx pgx.Tx) ([]Definition, error) {
	type config struct {
		entityType, facet, field, rootEN, rootRU, childEN, childRU string
	}
	configs := []config{
		{"achievement", "category", "Category", "Achievement categories", "Категории достижений", "Category", "Категория"},
		{"currency", "category", "CategoryID", "Currency categories", "Категории валют", "Category", "Категория"},
		{"mount", "source", "SourceTypeEnum", "Mount sources", "Источники транспорта", "Source", "Источник"},
		{"battle_pet", "pet_type", "PetTypeEnum", "Battle pet types", "Типы боевых питомцев", "Pet type", "Тип питомца"},
		{"toy", "source", "SourceTypeEnum", "Toy sources", "Источники игрушек", "Source", "Источник"},
		{"transmog_set", "expansion", "ExpansionID", "Transmog expansions", "Дополнения трансмогрификации", "Expansion", "Дополнение"},
		{"map", "map_type", "MapType", "Map types", "Типы карт", "Map type", "Тип карты"},
		{"area", "continent", "ContinentID", "Continents", "Континенты", "Continent", "Континент"},
		{"faction", "expansion", "Expansion", "Faction expansions", "Дополнения фракций", "Expansion", "Дополнение"},
	}
	definitions := make([]Definition, 0, len(configs)*10)
	for _, cfg := range configs {
		rootPath := cfg.facet + "s"
		definitions = append(definitions, Definition{EntityType: cfg.entityType, Facet: "group", Slug: rootPath,
			Path: rootPath, NameEN: cfg.rootEN, NameRU: cfg.rootRU, SortOrder: 10})
		rows, err := tx.Query(ctx, `
			SELECT DISTINCT (version.payload #>> ARRAY['db2',$2])::bigint AS value,
				COALESCE(NULLIF(category_en.payload->>'Name_lang',''),$3||' '||(version.payload #>> ARRAY['db2',$2])),
				COALESCE(NULLIF(category_ru.payload->>'Name_lang',''),NULLIF(category_en.payload->>'Name_lang',''),$4||' '||(version.payload #>> ARRAY['db2',$2]))
			FROM game_entities entity JOIN game_entity_versions version ON version.id=entity.latest_version_id
			LEFT JOIN catalog_db2_rows category_en ON $1='achievement' AND category_en.build_id=version.build_id
				AND category_en.table_name='Achievement_Category' AND category_en.locale='en_US'
				AND category_en.row_id=(version.payload #>> ARRAY['db2',$2])::bigint
			LEFT JOIN catalog_db2_rows category_ru ON $1='achievement' AND category_ru.build_id=version.build_id
				AND category_ru.table_name='Achievement_Category' AND category_ru.locale='ru_RU'
				AND category_ru.row_id=(version.payload #>> ARRAY['db2',$2])::bigint
			WHERE entity.entity_type=$1 AND entity.deleted_at IS NULL
			  AND version.payload #>> ARRAY['db2',$2] ~ '^[0-9]+$'
			ORDER BY 1`, cfg.entityType, cfg.field, cfg.childEN, cfg.childRU)
		if err != nil {
			return nil, fmt.Errorf("read %s taxonomy: %w", cfg.entityType, err)
		}
		for rows.Next() {
			var value int64
			var nameEN, nameRU string
			if err := rows.Scan(&value, &nameEN, &nameRU); err != nil {
				rows.Close()
				return nil, err
			}
			slug := fmt.Sprintf("%s-%d", cfg.facet, value)
			definitions = append(definitions, Definition{EntityType: cfg.entityType, Facet: cfg.facet,
				Slug: slug, Path: rootPath + "/" + slug, ParentPath: rootPath, NameEN: nameEN, NameRU: nameRU,
				SortOrder: int16(min(value, 32767)), Attributes: map[string]any{"field": cfg.field, "value": value}})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return definitions, nil
}

func upsertDefinitions(ctx context.Context, tx pgx.Tx, productID int16, definitions []Definition) (map[string]int64, error) {
	ids := make(map[string]int64, len(definitions))
	remaining := append([]Definition(nil), definitions...)
	for len(remaining) > 0 {
		progress := false
		next := make([]Definition, 0, len(remaining))
		for _, definition := range remaining {
			var parentID *int64
			if definition.ParentPath != "" {
				id, ok := ids[categoryKey(definition.EntityType, definition.ParentPath)]
				if !ok {
					next = append(next, definition)
					continue
				}
				parentID = &id
			}
			attributes, err := json.Marshal(definition.Attributes)
			if err != nil {
				return nil, fmt.Errorf("encode category %s: %w", definition.Path, err)
			}
			var id int64
			if err := tx.QueryRow(ctx, `
				INSERT INTO catalog_categories (product_id, parent_id, entity_type, facet, slug, path, sort_order, attributes)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				ON CONFLICT (product_id, entity_type, path) DO UPDATE SET
					parent_id=EXCLUDED.parent_id, facet=EXCLUDED.facet, slug=EXCLUDED.slug,
					sort_order=EXCLUDED.sort_order, attributes=EXCLUDED.attributes, updated_at=now()
				RETURNING id`, productID, parentID, definition.EntityType, definition.Facet, definition.Slug,
				definition.Path, definition.SortOrder, attributes).Scan(&id); err != nil {
				return nil, fmt.Errorf("upsert category %s: %w", definition.Path, err)
			}
			for _, localization := range []struct{ locale, name string }{{"en_US", definition.NameEN}, {"ru_RU", definition.NameRU}} {
				if _, err := tx.Exec(ctx, `
					INSERT INTO catalog_category_localizations (category_id, locale, name)
					VALUES ($1,$2,$3)
					ON CONFLICT (category_id, locale) DO UPDATE SET name=EXCLUDED.name`, id, localization.locale, localization.name); err != nil {
					return nil, fmt.Errorf("upsert category localization: %w", err)
				}
			}
			ids[categoryKey(definition.EntityType, definition.Path)] = id
			progress = true
		}
		if !progress {
			return nil, errors.New("category definitions contain an unresolved parent")
		}
		remaining = next
	}
	return ids, nil
}

func classify(ctx context.Context, tx pgx.Tx, categoryID int64, definition Definition) (int64, error) {
	if definition.Facet == "group" {
		return 0, nil
	}
	attributes := definition.Attributes
	var command pgconnCommandTag
	var err error
	switch definition.EntityType {
	case "item":
		command, err = classifyItem(ctx, tx, categoryID, definition.Facet, attributes)
	case "talent_tree":
		command, err = tx.Exec(ctx, categoryInsertPrefix+`
			SELECT e.latest_version_id, $1::bigint, 'gildra_classifier'
			FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
			WHERE e.entity_type='talent_tree' AND e.deleted_at IS NULL
			  AND ($2::bigint IS NULL OR (v.payload #>> '{raidbots,classId}')::bigint=$2)
			  AND ($3::bigint IS NULL OR e.external_id=$3)
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, nullableIntAttribute(attributes, "class_id"), nullableIntAttribute(attributes, "spec_id"))
	case "talent":
		command, err = tx.Exec(ctx, categoryInsertPrefix+`
			SELECT DISTINCT e.latest_version_id, $1::bigint, 'gildra_classifier'
			FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v.payload #> '{raidbots,appearances}','[]')) appearance
			WHERE e.entity_type='talent' AND e.deleted_at IS NULL
			  AND ($2::bigint IS NULL OR EXISTS (
				SELECT 1 FROM game_entities tree JOIN game_entity_versions tv ON tv.id=tree.latest_version_id
				WHERE tree.entity_type='talent_tree' AND tree.external_id=(appearance->>'spec_id')::bigint
				  AND (tv.payload #>> '{raidbots,classId}')::bigint=$2))
			  AND ($3::bigint IS NULL OR (appearance->>'spec_id')::bigint=$3)
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, nullableIntAttribute(attributes, "class_id"), nullableIntAttribute(attributes, "spec_id"))
	case "pvp_talent":
		command, err = tx.Exec(ctx, categoryInsertPrefix+`
			SELECT DISTINCT talent.latest_version_id,$1::bigint,'gildra_classifier'
			FROM game_entities talent JOIN game_entity_versions version ON version.id=talent.latest_version_id
			LEFT JOIN game_entities specialization ON specialization.entity_type='specialization'
				AND specialization.external_id=COALESCE(NULLIF(version.payload #>> '{db2,SpecID}','')::bigint,0)
				AND specialization.deleted_at IS NULL
			LEFT JOIN game_entity_versions specialization_version ON specialization_version.id=specialization.latest_version_id
			WHERE talent.entity_type='pvp_talent' AND talent.deleted_at IS NULL
			  AND ($2::bigint IS NULL OR COALESCE(NULLIF(specialization_version.payload #>> '{db2,ClassID}','')::bigint,0)=$2)
			  AND ($3::bigint IS NULL OR COALESCE(NULLIF(version.payload #>> '{db2,SpecID}','')::bigint,0)=$3)
			ON CONFLICT(version_id,category_id) DO NOTHING`, categoryID, nullableIntAttribute(attributes, "class_id"), nullableIntAttribute(attributes, "spec_id"))
	case "recipe":
		if definition.Facet == "profession" {
			command, err = tx.Exec(ctx, categoryInsertPrefix+`
				SELECT link.recipe_version_id,$1::bigint,'gildra_classifier'
				FROM catalog_profession_recipes link
				JOIN catalog_professions profession ON profession.version_id=link.profession_version_id
				WHERE profession.skill_line_id=$2
				ON CONFLICT(version_id,category_id) DO NOTHING`, categoryID, intAttribute(attributes, "skill_line_id"))
			break
		}
	case "spell":
		if definition.Facet == "race" {
			command, err = tx.Exec(ctx, categoryInsertPrefix+`
				SELECT DISTINCT spell.latest_version_id,$1::bigint,'gildra_classifier'
				FROM catalog_db2_rows ability
				CROSS JOIN unnest($2::bigint[]) race_bit
				JOIN game_entities spell ON spell.entity_type='spell' AND spell.external_id=(ability.payload->>'Spell')::bigint AND spell.deleted_at IS NULL
				JOIN game_entity_versions sv ON sv.id=spell.latest_version_id AND sv.build_id=ability.build_id
				WHERE ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND CASE WHEN race_bit<64 THEN (((ability.payload->>'RaceMasks_0')::bigint >> race_bit::int) & 1)=1
				           ELSE (((ability.payload->>'RaceMasks_1')::bigint >> (race_bit-64)::int) & 1)=1 END
				ON CONFLICT (version_id,category_id) DO NOTHING`, categoryID, intSliceAttribute(attributes, "race_bits"))
			break
		}
		if definition.Facet == "class" {
			classID := intAttribute(attributes, "class_id")
			command, err = tx.Exec(ctx, categoryInsertPrefix+`
				SELECT DISTINCT spell.latest_version_id,$1::bigint,'gildra_classifier'
				FROM game_entities spell
				WHERE spell.entity_type='spell' AND spell.deleted_at IS NULL
				  AND EXISTS (
					SELECT 1 FROM game_entities talent
					JOIN game_entity_versions tv ON tv.id=talent.latest_version_id
					CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tv.payload #> '{raidbots,appearances}','[]')) appearance
					WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL
					  AND spell.external_id=(tv.payload #>> '{raidbots,spellId}')::bigint
					  AND EXISTS (SELECT 1 FROM game_entities tree JOIN game_entity_versions treev ON treev.id=tree.latest_version_id
						WHERE tree.entity_type='talent_tree' AND tree.external_id=(appearance->>'spec_id')::bigint AND (treev.payload #>> '{raidbots,classId}')::bigint=$2)
				  )
				UNION
				SELECT DISTINCT spell.latest_version_id,$1::bigint,'gildra_classifier'
				FROM catalog_db2_rows ability
				JOIN game_entities spell ON spell.entity_type='spell' AND spell.external_id=(ability.payload->>'Spell')::bigint AND spell.deleted_at IS NULL
				JOIN game_entity_versions sv ON sv.id=spell.latest_version_id AND sv.build_id=ability.build_id
				WHERE ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND (((ability.payload->>'ClassMask')::bigint >> ($2::bigint-1)::int) & 1)=1
				ON CONFLICT (version_id,category_id) DO NOTHING`, categoryID, classID)
			break
		}
		command, err = tx.Exec(ctx, categoryInsertPrefix+`
			SELECT DISTINCT spell.latest_version_id, $1::bigint, 'gildra_classifier'
			FROM game_entities spell
			JOIN game_entities talent ON talent.entity_type='talent' AND talent.deleted_at IS NULL
			JOIN game_entity_versions tv ON tv.id=talent.latest_version_id
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tv.payload #> '{raidbots,appearances}','[]')) appearance
			WHERE spell.entity_type='spell' AND spell.deleted_at IS NULL
			  AND spell.external_id=(tv.payload #>> '{raidbots,spellId}')::bigint
			  AND ($2::bigint IS NULL OR EXISTS (
				SELECT 1 FROM game_entities tree JOIN game_entity_versions treev ON treev.id=tree.latest_version_id
				WHERE tree.entity_type='talent_tree' AND tree.external_id=(appearance->>'spec_id')::bigint
				  AND (treev.payload #>> '{raidbots,classId}')::bigint=$2))
			  AND ($3::bigint IS NULL OR (appearance->>'spec_id')::bigint=$3)
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, nullableIntAttribute(attributes, "class_id"), nullableIntAttribute(attributes, "spec_id"))
	default:
		field, _ := attributes["field"].(string)
		value := intAttribute(attributes, "value")
		if field == "" || value == nil {
			return 0, fmt.Errorf("unsupported %s facet %q", definition.EntityType, definition.Facet)
		}
		command, err = tx.Exec(ctx, categoryInsertPrefix+`
			SELECT entity.latest_version_id,$1::bigint,'gildra_classifier'
			FROM game_entities entity JOIN game_entity_versions version ON version.id=entity.latest_version_id
			WHERE entity.entity_type=$2 AND entity.deleted_at IS NULL
			  AND version.payload #>> ARRAY['db2',$3] ~ '^[0-9]+$'
			  AND (version.payload #>> ARRAY['db2',$3])::bigint=$4
			ON CONFLICT(version_id,category_id) DO NOTHING`, categoryID, definition.EntityType, field, *value)
	}
	if err != nil {
		return 0, err
	}
	return command.RowsAffected(), nil
}

type pgconnCommandTag interface{ RowsAffected() int64 }

const categoryInsertPrefix = `INSERT INTO game_entity_categories (version_id, category_id, source) `

func intAttribute(attributes map[string]any, key string) *int64 {
	value, ok := attributes[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case int:
		result := int64(typed)
		return &result
	case int64:
		return &typed
	default:
		return nil
	}
}

func nullableIntAttribute(attributes map[string]any, key string) any {
	value := intAttribute(attributes, key)
	if value == nil {
		return nil
	}
	return *value
}

func intSliceAttribute(attributes map[string]any, key string) []int64 {
	value, ok := attributes[key]
	if !ok {
		return nil
	}
	result, _ := value.([]int64)
	return result
}

func categoryKey(entityType, path string) string { return entityType + ":" + path }

func appendUnique(definitions []Definition, candidate Definition) []Definition {
	key := categoryKey(candidate.EntityType, candidate.Path)
	for _, definition := range definitions {
		if categoryKey(definition.EntityType, definition.Path) == key {
			return definitions
		}
	}
	return append(definitions, candidate)
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var result strings.Builder
	lastDash := false
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			result.WriteRune(char)
			lastDash = false
		} else if result.Len() > 0 && !lastDash {
			result.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(result.String(), "-")
}

func localizedClass(name string) string {
	translations := map[string]string{
		"Death Knight": "Рыцарь смерти", "Demon Hunter": "Охотник на демонов", "Druid": "Друид",
		"Evoker": "Пробудитель", "Hunter": "Охотник", "Mage": "Маг", "Monk": "Монах",
		"Paladin": "Паладин", "Priest": "Жрец", "Rogue": "Разбойник", "Shaman": "Шаман",
		"Warlock": "Чернокнижник", "Warrior": "Воин",
	}
	if result := translations[name]; result != "" {
		return result
	}
	return name
}
