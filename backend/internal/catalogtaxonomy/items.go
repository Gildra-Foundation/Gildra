package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (i *Indexer) RebuildItemTaxonomy(ctx context.Context) (Result, error) {
	return i.rebuildItems(ctx, false)
}

func (i *Indexer) RebuildItemVariants(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var err error
		result.Variants, result.VariantStats, result.VariantEffects, err = rebuildBaseItemVariants(ctx, tx)
		return err
	})
	return result, err
}

func (i *Indexer) rebuildItems(ctx context.Context, includeTooltips bool) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		definitions, err := itemTaxonomyDefinitions(ctx, tx)
		if err != nil {
			return err
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `DELETE FROM game_entity_categories ec USING catalog_categories c WHERE c.id=ec.category_id AND c.product_id=$1 AND c.entity_type='item' AND ec.source='gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear item categories: %w", err)
		}
		for _, definition := range definitions {
			written, err := classify(ctx, tx, categoryIDs[categoryKey(definition.EntityType, definition.Path)], definition)
			if err != nil {
				return fmt.Errorf("classify item %s: %w", definition.Path, err)
			}
			result.Assignments += written
		}
		result.Variants, result.VariantStats, result.VariantEffects, err = rebuildBaseItemVariants(ctx, tx)
		if err != nil {
			return err
		}
		if includeTooltips {
			result.Icons, err = rebuildEntityIcons(ctx, tx)
			if err != nil {
				return err
			}
			if err := rebuildSpellRelationships(ctx, tx); err != nil {
				return err
			}
			descriptions, err := rebuildCanonicalDescriptions(ctx, tx)
			if err != nil {
				return err
			}
			result.Descriptions += descriptions
			itemTooltipSQL := scopedTooltipSQL()
			command, err := tx.Exec(ctx, itemTooltipSQL, productID)
			if err != nil {
				return fmt.Errorf("rebuild entity tooltips: %w", err)
			}
			result.Tooltips = command.RowsAffected()
			result.Links, err = rebuildEntityGraph(ctx, tx)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return result, err
}

func rebuildBaseItemVariants(ctx context.Context, tx pgx.Tx) (int64, int64, int64, error) {
	command, err := tx.Exec(ctx, `
		INSERT INTO catalog_item_variants(item_version_id,snapshot_id,source_artifact_id,variant_key,
			item_level,quality,content_hash,attributes)
		SELECT version.id,version.snapshot_id,version.source_artifact_id,'base',item.item_level,
			CASE WHEN item.quality ~ '^[0-9]+$' THEN item.quality::int END,version.content_hash,
			jsonb_build_object('source',version.source,'projection','canonical_base')
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN catalog_items item ON item.version_id=version.id
		WHERE entity.entity_type='item' AND entity.deleted_at IS NULL
		ON CONFLICT(item_version_id,variant_key) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id,
			source_artifact_id=EXCLUDED.source_artifact_id,item_level=EXCLUDED.item_level,quality=EXCLUDED.quality,
			content_hash=EXCLUDED.content_hash,attributes=EXCLUDED.attributes,updated_at=now()`)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("rebuild base item variants: %w", err)
	}
	stats, err := tx.Exec(ctx, `
		UPDATE catalog_item_stats stat SET source_artifact_id=version.source_artifact_id
		FROM game_entity_versions version
		WHERE version.id=stat.version_id AND stat.source_artifact_id IS NULL
		  AND version.source_artifact_id IS NOT NULL;

		DELETE FROM catalog_item_variant_stats stats USING catalog_item_variants variant
		WHERE stats.variant_id=variant.id AND variant.variant_key='base';

		WITH current_items AS MATERIALIZED (
			SELECT item.id AS entity_id,item_version.id AS item_version_id,item_version.build_id,
				variant.id AS variant_id
			FROM game_entities item
			JOIN game_entity_versions item_version ON item_version.id=item.latest_version_id
			JOIN catalog_item_variants variant ON variant.item_version_id=item_version.id
				AND variant.variant_key='base'
			WHERE item.entity_type='item' AND item.deleted_at IS NULL
		), current_stats AS MATERIALIZED (
			SELECT DISTINCT ON (current.item_version_id,stat.slot)
				current.variant_id,stat.slot,stat.stat_type,stat.percent_editor,stat.socket_percentage,
				stat.source_artifact_id,fact_version.source
			FROM current_items current
			JOIN game_entity_versions fact_version ON fact_version.entity_id=current.entity_id
				AND fact_version.build_id=current.build_id
			JOIN catalog_item_stats stat ON stat.version_id=fact_version.id
			ORDER BY current.item_version_id,stat.slot,fact_version.revision DESC
		)
		INSERT INTO catalog_item_variant_stats(variant_id,stat_index,stat_type,value,allocation,socket_cost_rate,
			stat_key,stat_label,locale,source,attributes,source_artifact_id)
		SELECT stat.variant_id,stat.slot,stat.stat_type,NULL,stat.percent_editor,stat.socket_percentage,
			'stat_'||stat.stat_type,NULL,NULL,CASE WHEN stat.source='raidbots' THEN 'raidbots' ELSE 'db2' END,
			jsonb_build_object('value_kind','scaling_allocation','source_version',stat.source),
			stat.source_artifact_id
		FROM current_stats stat`, pgx.QueryExecModeSimpleProtocol)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("rebuild canonical item variant stats: %w", err)
	}
	effects, err := tx.Exec(ctx, `
		DELETE FROM catalog_item_variant_effects stored USING catalog_item_variants variant
		WHERE stored.variant_id=variant.id AND variant.variant_key='base';

		WITH current_items AS MATERIALIZED (
			SELECT item.id AS entity_id,item.product_id,item_version.id AS item_version_id,
				item_version.build_id,variant.id AS variant_id
			FROM game_entities item
			JOIN game_entity_versions item_version ON item_version.id=item.latest_version_id
			JOIN catalog_item_variants variant ON variant.item_version_id=item_version.id
				AND variant.variant_key='base'
			WHERE item.entity_type='item' AND item.deleted_at IS NULL
		), current_effects AS MATERIALIZED (
			SELECT DISTINCT ON (current.item_version_id,effect.item_effect_id)
				current.product_id,current.item_version_id,current.build_id,current.variant_id,
				effect.item_effect_id,effect.slot,effect.spell_id,effect.trigger_type,effect.charges,
				 effect.cooldown_ms,effect.category_cooldown_ms,effect.spell_category_id,
				effect.specialization_id,effect.player_condition_id,effect.source_artifact_id,
				effect.spell_name,effect.spell_target_status
			FROM current_items current
			JOIN game_entity_versions fact_version ON fact_version.entity_id=current.entity_id
				AND fact_version.build_id=current.build_id
			JOIN catalog_item_effects effect ON effect.version_id=fact_version.id
			ORDER BY current.item_version_id,effect.item_effect_id,fact_version.revision DESC
		)
		INSERT INTO catalog_item_variant_effects(
			variant_id,effect_index,spell_entity_id,spell_external_id,trigger_type,cooldown_ms,
			attributes,source_artifact_id)
		SELECT effect.variant_id,
			(row_number() OVER (PARTITION BY effect.item_version_id ORDER BY effect.slot,effect.item_effect_id)-1)::smallint,
		 CASE WHEN spell_version.id IS NULL THEN NULL ELSE spell.id END,effect.spell_id,effect.trigger_type,
			CASE WHEN effect.cooldown_ms<0 THEN NULL ELSE effect.cooldown_ms END,
			jsonb_build_object(
				'item_effect_id',effect.item_effect_id,
				'slot',effect.slot,
				'charges',effect.charges,
				'raw_cooldown_ms',effect.cooldown_ms,
				'category_cooldown_ms',effect.category_cooldown_ms,
				'spell_category_id',effect.spell_category_id,
				'specialization_id',effect.specialization_id,
				'player_condition_id',effect.player_condition_id,
				'spell_name',effect.spell_name,
				'spell_target_status',effect.spell_target_status,
				'projection','canonical_base'),
			effect.source_artifact_id
		FROM current_effects effect
		LEFT JOIN game_entities spell ON spell.product_id=effect.product_id AND spell.entity_type='spell'
			AND spell.external_id=effect.spell_id AND spell.deleted_at IS NULL
		LEFT JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id
			AND spell_version.build_id=effect.build_id`, pgx.QueryExecModeSimpleProtocol)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("rebuild canonical item variant effects: %w", err)
	}
	return command.RowsAffected(), stats.RowsAffected(), effects.RowsAffected(), nil
}

func itemTaxonomyDefinitions(ctx context.Context, tx pgx.Tx) ([]Definition, error) {
	definitions := itemDefinitions()
	var uncategorized Definition
	for index, definition := range definitions {
		if definition.Facet == "catalog_status" {
			uncategorized = definition
			definitions = append(definitions[:index], definitions[index+1:]...)
			break
		}
	}
	definitions = appendUnique(definitions, Definition{EntityType: "item", Facet: "group", Slug: "item-types",
		Path: "item-types", NameEN: "All item types", NameRU: "Все типы предметов", SortOrder: 30})
	rows, err := tx.Query(ctx, `
		SELECT class.class_id,class_en.name,COALESCE(NULLIF(class_ru.name,''),class_en.name),
			subclass.subclass_id,subclass_en.name,COALESCE(NULLIF(subclass_ru.name,''),subclass_en.name),
			class.db2_row_id,subclass.auction_house_sort_order
		FROM catalog_item_classes class
		JOIN game_builds build ON build.id=class.build_id AND build.is_active
		JOIN catalog_item_class_localizations class_en ON class_en.build_id=class.build_id
			AND class_en.class_id=class.class_id AND class_en.locale='en_US'
		LEFT JOIN catalog_item_class_localizations class_ru ON class_ru.build_id=class.build_id
			AND class_ru.class_id=class.class_id AND class_ru.locale='ru_RU'
		JOIN catalog_item_subclasses subclass ON subclass.build_id=class.build_id AND subclass.class_id=class.class_id
		JOIN catalog_item_subclass_localizations subclass_en ON subclass_en.build_id=subclass.build_id
			AND subclass_en.class_id=subclass.class_id AND subclass_en.subclass_id=subclass.subclass_id AND subclass_en.locale='en_US'
		LEFT JOIN catalog_item_subclass_localizations subclass_ru ON subclass_ru.build_id=subclass.build_id
			AND subclass_ru.class_id=subclass.class_id AND subclass_ru.subclass_id=subclass.subclass_id AND subclass_ru.locale='ru_RU'
		ORDER BY class.db2_row_id,subclass.auction_house_sort_order,subclass.subclass_id`)
	if err != nil {
		return nil, fmt.Errorf("read item class taxonomy: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var classID, subclassID, classOrder, subclassOrder int64
		var classEN, classRU, subclassEN, subclassRU string
		if err := rows.Scan(&classID, &classEN, &classRU, &subclassID, &subclassEN, &subclassRU, &classOrder, &subclassOrder); err != nil {
			return nil, fmt.Errorf("scan item class taxonomy: %w", err)
		}
		classSlug := slugify(classEN)
		if classSlug == "" {
			classSlug = fmt.Sprintf("class-%d", classID)
		}
		classPath := "item-types/" + classSlug
		definitions = appendUnique(definitions, Definition{EntityType: "item", Facet: "item_class",
			Slug: "class-" + fmt.Sprint(classID), Path: classPath, ParentPath: "item-types",
			NameEN: classEN, NameRU: classRU, SortOrder: int16(classOrder), Attributes: map[string]any{"item_class": classID}})
		subclassSlug := slugify(subclassEN)
		if subclassSlug == "" {
			subclassSlug = fmt.Sprintf("subclass-%d", subclassID)
		}
		definitions = appendUnique(definitions, Definition{EntityType: "item", Facet: "item_subclass",
			Slug: fmt.Sprintf("class-%d-subclass-%d", classID, subclassID), Path: classPath + "/" + subclassSlug,
			ParentPath: classPath, NameEN: subclassEN, NameRU: subclassRU, SortOrder: int16(subclassOrder),
			Attributes: map[string]any{"item_class": classID, "item_subclass": subclassID}})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate item class taxonomy: %w", err)
	}
	definitions = append(definitions, uncategorized)
	return definitions, nil
}

func classifyItem(ctx context.Context, tx pgx.Tx, categoryID int64, facet string, attributes map[string]any) (pgconnCommandTag, error) {
	base := categoryInsertPrefix + `
		SELECT e.latest_version_id, $1::bigint, 'gildra_classifier'
		FROM game_entities e
		JOIN game_entity_versions v ON v.id=e.latest_version_id
		JOIN catalog_items ci ON ci.version_id=e.latest_version_id
		WHERE e.entity_type='item' AND e.deleted_at IS NULL `
	switch facet {
	case "item_class":
		return tx.Exec(ctx, base+`
			AND ci.item_class_id=$2
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, intAttribute(attributes, "item_class"))
	case "item_subclass":
		return tx.Exec(ctx, base+`
			AND ci.item_class_id=$2 AND ci.item_subclass_id=$3
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID,
			intAttribute(attributes, "item_class"), intAttribute(attributes, "item_subclass"))
	case "armor_type", "weapon_type":
		return tx.Exec(ctx, base+`
			AND ci.item_class_id=$2
			AND ci.item_subclass_id=$3
			AND ($4::int IS NULL OR (ci.inventory_type ~ '^[0-9]+$' AND ci.inventory_type::int=$4))
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID,
			intAttribute(attributes, "item_class"), intAttribute(attributes, "item_subclass"), nullableIntAttribute(attributes, "inventory_type"))
	case "equipment_slot":
		return tx.Exec(ctx, base+`
			AND ci.inventory_type ~ '^[0-9]+$' AND ci.inventory_type::int=$2
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, intAttribute(attributes, "inventory_type"))
	case "profession":
		return tx.Exec(ctx, base+`
			AND (v.payload #>> '{raidbots,profession,id}')::int=$2
			ON CONFLICT (version_id, category_id) DO NOTHING`, categoryID, intAttribute(attributes, "profession_id"))
	case "catalog_status":
		return tx.Exec(ctx, `
			INSERT INTO game_entity_categories(version_id,category_id,source,confidence)
			SELECT e.latest_version_id,$1,'gildra_classifier',1
			FROM game_entities e
			JOIN game_products p ON p.id=e.product_id
			WHERE p.slug='wow' AND e.entity_type='item' AND e.deleted_at IS NULL AND e.latest_version_id IS NOT NULL
			  AND NOT EXISTS (
				SELECT 1 FROM game_entity_categories existing
				JOIN catalog_categories category ON category.id=existing.category_id
				WHERE existing.version_id=e.latest_version_id AND category.entity_type='item'
				  AND category.facet<>'catalog_status'
			  )
			ON CONFLICT(version_id,category_id) DO NOTHING`, categoryID)
	default:
		return nil, fmt.Errorf("unsupported item facet %q", facet)
	}
}
