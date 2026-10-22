package catalogtaxonomy

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (i *Indexer) RebuildTooltips(ctx context.Context) (Result, error) {
	return i.rebuildTooltips(ctx, nil)
}

// RebuildTooltipsForProduct refreshes only the requested product's candidate
// (latest-version) tooltip projection. The pipeline runs this stage before an
// atomic release publish, so it must prepare the new version rather than
// rewriting the already-public pointer. The catalog is multi-product; running
// the unscoped projection needlessly joins Classic/Era/Hardcore rows and can
// exceed the worker deadline.
func (i *Indexer) RebuildTooltipsForProduct(ctx context.Context, productID int16) (Result, error) {
	if productID <= 0 {
		return Result{}, errors.New("product id must be positive")
	}
	return i.rebuildTooltips(ctx, &productID)
}

func (i *Indexer) rebuildTooltips(ctx context.Context, productID *int16) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var err error
		if productID == nil {
			carried, carryErr := carryForwardOfficialLocalizations(ctx, tx)
			if carryErr != nil {
				return carryErr
			}
			result.Descriptions += carried
			if err := rebuildSpellRelationships(ctx, tx); err != nil {
				return err
			}
			result.Icons, err = rebuildEntityIcons(ctx, tx)
			if err != nil {
				return err
			}
			descriptions, descriptionErr := rebuildCanonicalDescriptions(ctx, tx)
			if descriptionErr != nil {
				return descriptionErr
			}
			result.Descriptions += descriptions
		}
		sql := tooltipSQL
		var args []any
		if productID != nil {
			// The localized CTE is the single write-producing scope.  Keep the
			// SQL text shared with the full rebuild while constraining all rows
			// that reach the renderer to one product.
			sql = scopedTooltipSQL()
			args = append(args, *productID)
		}
		command, err := tx.Exec(ctx, sql, args...)
		if err != nil {
			return fmt.Errorf("rebuild entity tooltips: %w", err)
		}
		result.Tooltips = command.RowsAffected()
		if productID == nil {
			result.Links, err = rebuildEntityGraph(ctx, tx)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return result, err
}

func (i *Indexer) RebuildTalentTooltips(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		if err := rebuildSpellRelationships(ctx, tx); err != nil {
			return err
		}
		var err error
		result.Icons, err = rebuildEntityIcons(ctx, tx)
		if err != nil {
			return err
		}
		talentSQL := tooltipSQLForEntityTypes("talent", "pvp_talent")
		command, err := tx.Exec(ctx, talentSQL)
		if err != nil {
			return fmt.Errorf("rebuild talent tooltips: %w", err)
		}
		result.Tooltips = command.RowsAffected()
		result.Links, err = rebuildEntityGraph(ctx, tx)
		if err != nil {
			return err
		}
		return nil
	})
	return result, err
}

func scopedTooltipSQL() string {
	return strings.Replace(tooltipSQL,
		"WHERE e.deleted_at IS NULL",
		"WHERE e.product_id=$1 AND e.deleted_at IS NULL", 1)
}

// tooltipSQLForEntityTypes narrows the renderer to the requested entity types.
// Keep the values internal constants: this helper is used to select rebuild
// modes, not to interpolate user input into SQL.
func tooltipSQLForEntityTypes(entityTypes ...string) string {
	quoted := make([]string, 0, len(entityTypes))
	for _, entityType := range entityTypes {
		if strings.TrimSpace(entityType) == "" {
			continue
		}
		quoted = append(quoted, "'"+strings.ReplaceAll(entityType, "'", "''")+"'")
	}
	if len(quoted) == 0 {
		return tooltipSQL
	}
	filter := "WHERE e.entity_type IN (" + strings.Join(quoted, ",") + ") AND e.deleted_at IS NULL"
	return strings.Replace(tooltipSQL, "WHERE e.deleted_at IS NULL", filter, 1)
}

const tooltipSQL = `
	WITH spell_misc_rows AS (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellMisc' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'DifficultyID','')::int,0),row_id
	), spell_cooldown_rows AS (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellCooldowns' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'DifficultyID','')::int,0),row_id
	), spell_power_rows AS (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellPower' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),row_id
	), item_effect_rows AS (
		SELECT links.build_id,(links.payload->>'ItemID')::bigint AS item_id,locale.code AS locale,
			jsonb_agg(jsonb_build_object(
				'type','effect','trigger',COALESCE(NULLIF(effect.payload->>'TriggerType','')::int,0),
				'spell_id',COALESCE(NULLIF(effect.payload->>'SpellID','')::bigint,0),
				'spell_name',COALESCE(NULLIF(spell_name.payload->>'Name_lang',''),NULLIF(spell_name_fallback.payload->>'Name_lang',''),''),
				'spell_target_status',CASE WHEN spell_name_fallback.row_id IS NULL THEN 'unavailable_in_build' ELSE 'resolved' END,
				'text',COALESCE(NULLIF(spell_text.payload->>'Description_lang',''),
					CASE WHEN spell_name_fallback.row_id IS NULL AND locale.code='ru_RU'
						THEN 'Эффект недоступен в данных этой сборки.'
					WHEN spell_name_fallback.row_id IS NULL
						THEN 'Effect unavailable in this build.'
					ELSE COALESCE(NULLIF(spell_name.payload->>'Name_lang',''),NULLIF(spell_name_fallback.payload->>'Name_lang','')) END)
			) ORDER BY COALESCE(NULLIF(effect.payload->>'LegacySlotIndex','')::int,0),links.row_id) AS effects
		FROM catalog_db2_rows links
		JOIN catalog_db2_rows effect ON effect.build_id=links.build_id AND effect.table_name='ItemEffect' AND effect.locale='en_US'
			AND effect.row_id=(links.payload->>'ItemEffectID')::bigint
		CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(code)
		LEFT JOIN catalog_db2_rows spell_name ON spell_name.build_id=links.build_id AND spell_name.table_name='SpellName'
			AND spell_name.row_id=(effect.payload->>'SpellID')::bigint AND spell_name.locale=locale.code
		LEFT JOIN catalog_db2_rows spell_name_fallback ON spell_name_fallback.build_id=links.build_id AND spell_name_fallback.table_name='SpellName'
			AND spell_name_fallback.row_id=(effect.payload->>'SpellID')::bigint AND spell_name_fallback.locale='en_US'
		LEFT JOIN catalog_db2_rows spell_text ON spell_text.build_id=links.build_id AND spell_text.table_name='Spell'
			AND spell_text.row_id=(effect.payload->>'SpellID')::bigint AND spell_text.locale=locale.code
		WHERE links.table_name='ItemXItemEffect' AND links.locale='en_US'
		GROUP BY links.build_id,(links.payload->>'ItemID')::bigint,locale.code
	), item_acquisition_rows AS (
		SELECT source.version_id,locale.code AS locale,
			jsonb_agg(jsonb_build_object(
				'type','acquisition','source_type',source.source_type,'source_id',source.source_id,
				'name',CASE WHEN source.source_type='encounter' THEN COALESCE(encounter_name.name,encounter_fallback.name,'')
					ELSE COALESCE(recipe_name.name,recipe_fallback.name,'') END,
				'location',CASE WHEN source.source_type='encounter' THEN COALESCE(instance_name.name,instance_fallback.name,'') ELSE '' END,
				'difficulty_mask',source.difficulty_mask,
				'chance_percent',CASE WHEN source.chance_source IN ('db2','blizzard_api','observed') THEN source.chance_percent END,
				'evidence_source',CASE WHEN source.chance_source IN ('db2','blizzard_api','observed') THEN source.chance_source END
			) ORDER BY source.source_type,source.source_id) AS sources
		FROM catalog_item_acquisition_sources source
		CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(code)
		LEFT JOIN game_entity_localizations recipe_name ON recipe_name.version_id=(
			SELECT entity.latest_version_id FROM game_entities entity WHERE entity.id=source.source_entity_id)
			AND recipe_name.locale=locale.code
		LEFT JOIN game_entity_localizations recipe_fallback ON recipe_fallback.version_id=(
			SELECT entity.latest_version_id FROM game_entities entity WHERE entity.id=source.source_entity_id)
			AND recipe_fallback.locale='en_US'
		LEFT JOIN game_entity_versions item_version ON item_version.id=source.version_id
		LEFT JOIN catalog_journal_encounter_localizations encounter_name ON encounter_name.build_id=item_version.build_id
			AND encounter_name.journal_encounter_id=source.source_id AND encounter_name.locale=locale.code
		LEFT JOIN catalog_journal_encounter_localizations encounter_fallback ON encounter_fallback.build_id=item_version.build_id
			AND encounter_fallback.journal_encounter_id=source.source_id AND encounter_fallback.locale='en_US'
		LEFT JOIN catalog_journal_instance_localizations instance_name ON instance_name.build_id=item_version.build_id
			AND instance_name.journal_instance_id=source.journal_instance_id AND instance_name.locale=locale.code
		LEFT JOIN catalog_journal_instance_localizations instance_fallback ON instance_fallback.build_id=item_version.build_id
			AND instance_fallback.journal_instance_id=source.journal_instance_id AND instance_fallback.locale='en_US'
		GROUP BY source.version_id,locale.code
	), spell_owner_rows AS (
		SELECT owner.spell_version_id,locale.code AS locale,
			jsonb_agg(jsonb_build_object('owner_type',owner.owner_type,'owner_id',owner.owner_id,
				'entity_id',owner_entity.id,
				'name',COALESCE(
					CASE WHEN owner.owner_type IN ('class','specialization','profession') THEN COALESCE(owner_name.name,owner_fallback.name) END,
					CASE WHEN owner.owner_type='race' THEN race_name.payload->>'Name_lang' END,
					''),
				'icon_name',COALESCE(owner_icon.icon_name,owner_source_icon.icon_name,owner_payload_icon.icon_name),
				'class_id',CASE WHEN owner.owner_type='specialization' THEN NULLIF(owner_version.payload #>> '{db2,ClassID}','')::int END,
				'class_name',CASE WHEN owner.owner_type='specialization' THEN COALESCE(class_name.name,class_fallback.name,'') END,
				'class_icon_name',CASE WHEN owner.owner_type='specialization' THEN COALESCE(class_icon.icon_name,class_source_icon.icon_name) END)
				ORDER BY owner.owner_type,owner.owner_id) AS owners
		FROM catalog_spell_owners owner
		CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(code)
		LEFT JOIN game_entity_versions spell_version ON spell_version.id=owner.spell_version_id
		LEFT JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id
		LEFT JOIN game_entities owner_entity ON owner.owner_type IN ('class','specialization','profession')
			AND owner_entity.product_id=spell_entity.product_id AND owner_entity.entity_type=owner.owner_type
			AND owner_entity.external_id=owner.owner_id AND owner_entity.deleted_at IS NULL
		LEFT JOIN game_entity_versions owner_version ON owner_version.id=owner_entity.latest_version_id
		LEFT JOIN game_entity_localizations owner_name ON owner_name.version_id=owner_version.id AND owner_name.locale=locale.code
		LEFT JOIN game_entity_localizations owner_fallback ON owner_fallback.version_id=owner_version.id AND owner_fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons owner_source_icon ON owner_source_icon.build_id=owner_version.build_id
			AND owner_source_icon.entity_type=owner_entity.entity_type AND owner_source_icon.external_id=owner_entity.external_id
		LEFT JOIN catalog_file_assets owner_icon ON owner_icon.file_data_id=CASE
			WHEN owner_version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (owner_version.payload->>'icon_file_data_id')::bigint END
		LEFT JOIN catalog_file_assets owner_payload_icon ON owner_payload_icon.file_data_id=CASE
			WHEN COALESCE(owner_version.payload #>> '{db2,IconFileDataID}',owner_version.payload #>> '{db2,SpellIconFileID}') ~ '^[0-9]+$'
			THEN COALESCE(owner_version.payload #>> '{db2,IconFileDataID}',owner_version.payload #>> '{db2,SpellIconFileID}')::bigint END
		LEFT JOIN game_entities class_entity ON owner.owner_type='specialization' AND class_entity.product_id=spell_entity.product_id
			AND class_entity.entity_type='class' AND class_entity.external_id=NULLIF(owner_version.payload #>> '{db2,ClassID}','')::bigint
			AND class_entity.deleted_at IS NULL
		LEFT JOIN game_entity_versions class_version ON class_version.id=class_entity.latest_version_id
		LEFT JOIN game_entity_localizations class_name ON class_name.version_id=class_version.id AND class_name.locale=locale.code
		LEFT JOIN game_entity_localizations class_fallback ON class_fallback.version_id=class_version.id AND class_fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons class_source_icon ON class_source_icon.build_id=class_version.build_id
			AND class_source_icon.entity_type='class' AND class_source_icon.external_id=class_entity.external_id
		LEFT JOIN catalog_file_assets class_icon ON class_icon.file_data_id=CASE
			WHEN class_version.payload #>> '{db2,IconFileDataID}' ~ '^[0-9]+$' THEN (class_version.payload #>> '{db2,IconFileDataID}')::bigint END
		LEFT JOIN catalog_db2_rows race_name ON owner.owner_type='race' AND race_name.build_id=spell_version.build_id
			AND race_name.table_name='ChrRaces' AND race_name.locale=locale.code AND race_name.row_id=owner.owner_id
		GROUP BY owner.spell_version_id,locale.code
	), spell_talent_rows AS (
		SELECT link.spell_version_id,locale.code AS locale,
			jsonb_agg(jsonb_build_object('talent_id',talent.external_id,'name',COALESCE(talent_name.name,talent_fallback.name,''),
				'entity_id',talent.id,'icon_name',COALESCE(talent_source_icon.icon_name,talent_direct_icon.icon_name,
					NULLIF(talent_version.payload #>> '{raidbots,icon}','')),
				'relationship',link.relationship,'max_ranks',COALESCE(NULLIF(link.attributes->>'max_ranks','')::int,1))
				ORDER BY talent.external_id) AS talents
		FROM catalog_talent_spell_relations link
		JOIN game_entity_versions talent_version ON talent_version.id=link.talent_version_id
		JOIN game_entities talent ON talent.id=talent_version.entity_id
		CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(code)
		LEFT JOIN game_entity_localizations talent_name ON talent_name.version_id=link.talent_version_id AND talent_name.locale=locale.code
		LEFT JOIN game_entity_localizations talent_fallback ON talent_fallback.version_id=link.talent_version_id AND talent_fallback.locale='en_US'
		LEFT JOIN catalog_entity_icons talent_source_icon ON talent_source_icon.build_id=talent_version.build_id
			AND talent_source_icon.entity_type=talent.entity_type AND talent_source_icon.external_id=talent.external_id
		LEFT JOIN catalog_file_assets talent_direct_icon ON talent_direct_icon.file_data_id=CASE
			WHEN talent_version.payload->>'icon_file_data_id' ~ '^[0-9]+$' THEN (talent_version.payload->>'icon_file_data_id')::bigint END
		GROUP BY link.spell_version_id,locale.code
	), localized AS (
		SELECT v.id AS version_id, e.entity_type, l.locale, l.name,
			COALESCE(NULLIF(l.description,''),NULLIF(linked_spell_local.description,''),NULLIF(linked_spell_fallback.description,''),NULLIF(item_sparse_local.payload->>'Description_lang',''),NULLIF(item_sparse_fallback.payload->>'Description_lang',''),fallback.description,'') AS description,
			v.payload,
			l.attributes AS localized_payload,
			COALESCE(v.payload->'raidbots', '{}'::jsonb) AS item,
			COALESCE(to_jsonb(item_detail),'{}'::jsonb) AS item_detail,
			COALESCE(item_sparse_local.payload,item_sparse_fallback.payload,l.attributes->'db2',v.payload->'db2','{}'::jsonb) AS db2,
			COALESCE(item_effects.effects,'[]'::jsonb) AS item_effects,
			COALESCE(item_acquisition.sources,'[]'::jsonb) AS item_acquisition,
			COALESCE(spell_owners.owners,'[]'::jsonb) AS spell_owners,
			COALESCE(spell_talents.talents,'[]'::jsonb) AS spell_talents,
			COALESCE(NULLIF(item_set_local.payload->>'Name_lang',''),item_set_fallback.payload->>'Name_lang','') AS item_set_name,
			COALESCE(NULLIF(item_limit_local.payload->>'Name_lang',''),item_limit_fallback.payload->>'Name_lang','') AS item_limit_name,
			COALESCE(NULLIF(item_limit_local.payload->>'Quantity','')::int,NULLIF(item_limit_fallback.payload->>'Quantity','')::int,0) AS item_limit_quantity,
			COALESCE(NULLIF(item_name_description_local.payload->>'Description_lang',''),item_name_description_fallback.payload->>'Description_lang','') AS item_name_description,
			COALESCE(spell_misc.payload, '{}'::jsonb) AS spell_misc,
			COALESCE(spell_cast.payload, '{}'::jsonb) AS spell_cast,
			COALESCE(spell_range_local.payload, spell_range_fallback.payload, '{}'::jsonb) AS spell_range,
			COALESCE(spell_cooldown.payload, '{}'::jsonb) AS spell_cooldown,
			COALESCE(spell_duration.payload, '{}'::jsonb) AS spell_duration,
			COALESCE(spell_power.payload, '{}'::jsonb) AS spell_power,
			v.source_url
		FROM game_entities e
		JOIN game_entity_versions v ON v.id=e.latest_version_id
		JOIN LATERAL (
			SELECT localized.locale,localized.slug,localized.name,localized.description,localized.attributes
			FROM game_entity_localizations localized WHERE localized.version_id=v.id
			UNION ALL
			SELECT 'ru_RU',english.slug,english.name,'',english.attributes
			FROM game_entity_localizations english
			WHERE e.entity_type IN ('talent','pvp_talent') AND english.version_id=v.id AND english.locale='en_US'
			  AND NOT EXISTS (SELECT 1 FROM game_entity_localizations russian WHERE russian.version_id=v.id AND russian.locale='ru_RU')
		) l ON true
		LEFT JOIN catalog_items item_detail ON item_detail.version_id=v.id
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
		LEFT JOIN catalog_db2_rows item_sparse_local ON e.entity_type='item' AND item_sparse_local.build_id=v.build_id
			AND item_sparse_local.table_name='ItemSparse' AND item_sparse_local.locale=l.locale AND item_sparse_local.row_id=e.external_id
		LEFT JOIN catalog_db2_rows item_sparse_fallback ON e.entity_type='item' AND item_sparse_fallback.build_id=v.build_id
			AND item_sparse_fallback.table_name='ItemSparse' AND item_sparse_fallback.locale='en_US' AND item_sparse_fallback.row_id=e.external_id
		LEFT JOIN item_effect_rows item_effects ON e.entity_type='item' AND item_effects.build_id=v.build_id
			AND item_effects.item_id=e.external_id AND item_effects.locale=l.locale
		LEFT JOIN item_acquisition_rows item_acquisition ON e.entity_type='item'
			AND item_acquisition.version_id=v.id AND item_acquisition.locale=l.locale
		LEFT JOIN catalog_talent_spell_links talent_spell ON e.entity_type IN ('talent','pvp_talent') AND talent_spell.talent_version_id=v.id
		LEFT JOIN game_entity_localizations linked_spell_local ON linked_spell_local.version_id=talent_spell.spell_version_id AND linked_spell_local.locale=l.locale
		LEFT JOIN game_entity_localizations linked_spell_fallback ON linked_spell_fallback.version_id=talent_spell.spell_version_id AND linked_spell_fallback.locale='en_US'
		LEFT JOIN spell_owner_rows spell_owners ON e.entity_type='spell' AND spell_owners.spell_version_id=v.id AND spell_owners.locale=l.locale
		LEFT JOIN spell_talent_rows spell_talents ON e.entity_type='spell' AND spell_talents.spell_version_id=v.id AND spell_talents.locale=l.locale
		LEFT JOIN catalog_db2_rows item_set_local ON e.entity_type='item' AND item_set_local.build_id=v.build_id
			AND item_set_local.table_name='ItemSet' AND item_set_local.locale=l.locale
			AND item_set_local.row_id=COALESCE(NULLIF(item_sparse_local.payload->>'ItemSet','')::bigint,NULLIF(item_sparse_fallback.payload->>'ItemSet','')::bigint,0)
		LEFT JOIN catalog_db2_rows item_set_fallback ON e.entity_type='item' AND item_set_fallback.build_id=v.build_id
			AND item_set_fallback.table_name='ItemSet' AND item_set_fallback.locale='en_US'
			AND item_set_fallback.row_id=COALESCE(NULLIF(item_sparse_fallback.payload->>'ItemSet','')::bigint,0)
		LEFT JOIN catalog_db2_rows item_limit_local ON e.entity_type='item' AND item_limit_local.build_id=v.build_id
			AND item_limit_local.table_name='ItemLimitCategory' AND item_limit_local.locale=l.locale
			AND item_limit_local.row_id=COALESCE(NULLIF(item_sparse_local.payload->>'LimitCategory','')::bigint,NULLIF(item_sparse_fallback.payload->>'LimitCategory','')::bigint,0)
		LEFT JOIN catalog_db2_rows item_limit_fallback ON e.entity_type='item' AND item_limit_fallback.build_id=v.build_id
			AND item_limit_fallback.table_name='ItemLimitCategory' AND item_limit_fallback.locale='en_US'
			AND item_limit_fallback.row_id=COALESCE(NULLIF(item_sparse_fallback.payload->>'LimitCategory','')::bigint,0)
		LEFT JOIN catalog_db2_rows item_name_description_local ON e.entity_type='item' AND item_name_description_local.build_id=v.build_id
			AND item_name_description_local.table_name='ItemNameDescription' AND item_name_description_local.locale=l.locale
			AND item_name_description_local.row_id=COALESCE(NULLIF(item_sparse_local.payload->>'ItemNameDescriptionID','')::bigint,NULLIF(item_sparse_fallback.payload->>'ItemNameDescriptionID','')::bigint,0)
		LEFT JOIN catalog_db2_rows item_name_description_fallback ON e.entity_type='item' AND item_name_description_fallback.build_id=v.build_id
			AND item_name_description_fallback.table_name='ItemNameDescription' AND item_name_description_fallback.locale='en_US'
			AND item_name_description_fallback.row_id=COALESCE(NULLIF(item_sparse_fallback.payload->>'ItemNameDescriptionID','')::bigint,0)
		LEFT JOIN spell_misc_rows spell_misc ON e.entity_type='spell' AND spell_misc.build_id=v.build_id AND spell_misc.spell_id=e.external_id
		LEFT JOIN catalog_db2_rows spell_cast ON spell_cast.build_id=v.build_id
			AND spell_cast.table_name='SpellCastTimes' AND spell_cast.locale='en_US'
			AND spell_cast.row_id=COALESCE((NULLIF(spell_misc.payload->>'CastingTimeIndex',''))::bigint,0)
		LEFT JOIN catalog_db2_rows spell_range_local ON spell_range_local.build_id=v.build_id
			AND spell_range_local.table_name='SpellRange' AND spell_range_local.locale=l.locale
			AND spell_range_local.row_id=COALESCE((NULLIF(spell_misc.payload->>'RangeIndex',''))::bigint,0)
		LEFT JOIN catalog_db2_rows spell_range_fallback ON spell_range_fallback.build_id=v.build_id
			AND spell_range_fallback.table_name='SpellRange' AND spell_range_fallback.locale='en_US'
			AND spell_range_fallback.row_id=COALESCE((NULLIF(spell_misc.payload->>'RangeIndex',''))::bigint,0)
		LEFT JOIN spell_cooldown_rows spell_cooldown ON e.entity_type='spell' AND spell_cooldown.build_id=v.build_id AND spell_cooldown.spell_id=e.external_id
		LEFT JOIN catalog_db2_rows spell_duration ON spell_duration.build_id=v.build_id
			AND spell_duration.table_name='SpellDuration' AND spell_duration.locale='en_US'
			AND spell_duration.row_id=COALESCE((NULLIF(spell_misc.payload->>'DurationIndex',''))::bigint,0)
		LEFT JOIN spell_power_rows spell_power ON e.entity_type='spell' AND spell_power.build_id=v.build_id AND spell_power.spell_id=e.external_id
		WHERE e.deleted_at IS NULL
	), rendered AS (
		SELECT version_id, entity_type, locale, source_url,
			concat_ws(E'\n', name, NULLIF(description,'')) AS plain_text,
			jsonb_build_array(jsonb_build_object('type','name','text',name,'quality',item->'quality'))
			|| CASE WHEN entity_type='item' AND item_detail ? 'item_level' THEN jsonb_build_array(jsonb_build_object('type','item_level','value',item_detail->'item_level')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item_detail->>'inventory_type' ~ '^[0-9]+$' AND item_detail->>'inventory_type'<>'0' THEN jsonb_build_array(jsonb_build_object('type','slot','code',(item_detail->>'inventory_type')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item_detail ? 'item_class_id' THEN jsonb_build_array(jsonb_build_object('type','subclass','class_id',item_detail->'item_class_id','subclass_id',item_detail->'item_subclass_id')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND NULLIF(db2->>'Bonding','') IS NOT NULL AND (db2->>'Bonding')::int > 0 THEN jsonb_build_array(jsonb_build_object('type','binding','code',(db2->>'Bonding')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND NULLIF(db2->>'RequiredLevel','') IS NOT NULL AND (db2->>'RequiredLevel')::int > 0 THEN jsonb_build_array(jsonb_build_object('type','required_level','value',(db2->>'RequiredLevel')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND NULLIF(db2->>'RequiredSkill','') IS NOT NULL AND (db2->>'RequiredSkill')::int > 0 THEN jsonb_build_array(jsonb_build_object('type','required_skill','skill_id',(db2->>'RequiredSkill')::int,'rank',COALESCE(NULLIF(db2->>'RequiredSkillRank','')::int,0))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND COALESCE(NULLIF(item_detail->>'max_count','')::int,0)>1 THEN jsonb_build_array(jsonb_build_object('type','stack_limit','value',(item_detail->>'max_count')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND (COALESCE(NULLIF(item_detail->>'purchase_price','')::bigint,0)>0 OR COALESCE(NULLIF(item_detail->>'sell_price','')::bigint,0)>0) THEN jsonb_build_array(jsonb_build_object('type','price','buy',COALESCE(NULLIF(item_detail->>'purchase_price','')::bigint,0),'sell',COALESCE(NULLIF(item_detail->>'sell_price','')::bigint,0))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND COALESCE(NULLIF(db2->>'ContainerSlots','')::int,0)>0 THEN jsonb_build_array(jsonb_build_object('type','container_slots','value',(db2->>'ContainerSlots')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item_name_description<>'' THEN jsonb_build_array(jsonb_build_object('type','name_description','text',item_name_description)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item_set_name<>'' THEN jsonb_build_array(jsonb_build_object('type','item_set','name',item_set_name,'set_id',COALESCE(NULLIF(db2->>'ItemSet','')::bigint,0))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item_limit_name<>'' THEN jsonb_build_array(jsonb_build_object('type','limit_category','name',item_limit_name,'quantity',item_limit_quantity)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item ? 'stats' THEN jsonb_build_array(jsonb_build_object('type','stats','entries',item->'stats')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item ? 'socketInfo' THEN jsonb_build_array(jsonb_build_object('type','sockets','value',item->'socketInfo')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND item ? 'profession' THEN jsonb_build_array(jsonb_build_object('type','profession','value',item->'profession')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' AND COALESCE((item->>'uniqueEquipped')::boolean,false) THEN jsonb_build_array(jsonb_build_object('type','unique_equipped')) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' THEN item_effects ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='item' THEN item_acquisition ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND NULLIF(COALESCE(localized_payload->>'subtext',payload->>'subtext'),'') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','subtext','text',COALESCE(localized_payload->>'subtext',payload->>'subtext'))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND jsonb_array_length(spell_owners)>0 THEN jsonb_build_array(jsonb_build_object('type','spell_owners','entries',spell_owners)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND jsonb_array_length(spell_talents)>0 THEN jsonb_build_array(jsonb_build_object('type','spell_talents','entries',spell_talents)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='talent' THEN jsonb_build_array(jsonb_build_object('type','talent_info',
				'talent_type',COALESCE(payload #>> '{raidbots,type}',''),'max_ranks',COALESCE(NULLIF(payload #>> '{raidbots,maxRanks}','')::int,1),
				'spell_id',COALESCE(NULLIF(payload #>> '{raidbots,spellId}','')::bigint,0),'appearances',COALESCE(payload #> '{raidbots,appearances}','[]'::jsonb))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='pvp_talent' THEN jsonb_build_array(jsonb_build_object('type','talent_info',
				'talent_type','pvp','max_ranks',1,'spell_id',COALESCE(NULLIF(payload #>> '{db2,SpellID}','')::bigint,0),
				'appearances',jsonb_build_array(jsonb_build_object('spec_id',COALESCE(NULLIF(payload #>> '{db2,SpecID}','')::bigint,0))),
				'level_required',COALESCE(NULLIF(payload #>> '{db2,LevelRequired}','')::int,0),
				'player_condition_id',COALESCE(NULLIF(payload #>> '{db2,PlayerConditionID}','')::bigint,0),
				'overrides_spell_id',COALESCE(NULLIF(payload #>> '{db2,OverridesSpellID}','')::bigint,0))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND NULLIF(spell_cast->>'Base','') IS NOT NULL THEN jsonb_build_array(jsonb_build_object('type','cast_time','milliseconds',(spell_cast->>'Base')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND COALESCE(NULLIF(spell_range->>'RangeMax_0','')::numeric,0) > 0 THEN jsonb_build_array(jsonb_build_object('type','range','yards',(spell_range->>'RangeMax_0')::numeric)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND GREATEST(COALESCE(NULLIF(spell_cooldown->>'RecoveryTime','')::int,0),COALESCE(NULLIF(spell_cooldown->>'CategoryRecoveryTime','')::int,0)) > 0 THEN jsonb_build_array(jsonb_build_object('type','cooldown','milliseconds',GREATEST(COALESCE(NULLIF(spell_cooldown->>'RecoveryTime','')::int,0),COALESCE(NULLIF(spell_cooldown->>'CategoryRecoveryTime','')::int,0)))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND COALESCE(NULLIF(spell_duration->>'Duration','')::int,0) > 0 THEN jsonb_build_array(jsonb_build_object('type','duration','milliseconds',(spell_duration->>'Duration')::int)) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND (COALESCE(NULLIF(spell_power->>'ManaCost','')::int,0) > 0 OR COALESCE(NULLIF(spell_power->>'PowerCostPct','')::numeric,0) > 0) THEN jsonb_build_array(jsonb_build_object('type','power','amount',COALESCE(NULLIF(spell_power->>'ManaCost','')::int,0),'percent',COALESCE(NULLIF(spell_power->>'PowerCostPct','')::numeric,0),'power_type',COALESCE(NULLIF(spell_power->>'PowerType','')::int,0))) ELSE '[]'::jsonb END
			|| CASE WHEN entity_type='spell' AND NULLIF(COALESCE(localized_payload->>'aura_description',payload->>'aura_description'),'') IS NOT NULL AND COALESCE(localized_payload->>'aura_description',payload->>'aura_description') IS DISTINCT FROM description THEN jsonb_build_array(jsonb_build_object('type','effect','text',COALESCE(localized_payload->>'aura_description',payload->>'aura_description'))) ELSE '[]'::jsonb END
			|| CASE WHEN description<>'' THEN jsonb_build_array(jsonb_build_object('type','description','text',description)) ELSE '[]'::jsonb END AS blocks
		FROM localized
	), hashed AS (
		SELECT *, digest(convert_to(plain_text || blocks::text, 'UTF8'), 'sha256') AS content_hash
		FROM rendered
	)
	INSERT INTO catalog_entity_tooltips (version_id, locale, plain_text, blocks, content_hash, source_url)
	SELECT version_id, locale, plain_text, blocks, content_hash, source_url FROM hashed
	ON CONFLICT (version_id, locale) DO UPDATE SET
		plain_text=EXCLUDED.plain_text, blocks=EXCLUDED.blocks, content_hash=EXCLUDED.content_hash,
		source_url=EXCLUDED.source_url, generated_at=now()`
