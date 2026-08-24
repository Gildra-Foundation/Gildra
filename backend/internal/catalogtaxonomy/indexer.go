package catalogtaxonomy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Definition struct {
	EntityType string
	Facet      string
	Slug       string
	Path       string
	ParentPath string
	NameEN     string
	NameRU     string
	SortOrder  int16
	Attributes map[string]any
}

type Result struct {
	Categories   int64 `json:"categories"`
	Assignments  int64 `json:"assignments"`
	Tooltips     int64 `json:"tooltips"`
	Icons        int64 `json:"icons,omitempty"`
	SpellEffects int64 `json:"spellEffects,omitempty"`
	Links        int64 `json:"links,omitempty"`
	Variants     int64 `json:"variants,omitempty"`
	Descriptions int64 `json:"descriptions,omitempty"`
}

type Indexer struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Indexer { return &Indexer{db: db} }

func (i *Indexer) RebuildSpellEffects(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_spell_effects WHERE source='db2'`); err != nil {
			return fmt.Errorf("clear DB2 spell effects: %w", err)
		}
		command, err := tx.Exec(ctx, `INSERT INTO catalog_spell_effects(
			spell_version_id,effect_index,difficulty_id,effect_type,aura_type,base_points,coefficient,
			attack_power_coefficient,amplitude_ms,radius_index,chain_targets,mechanic_id,source,attributes)
		SELECT version.id,COALESCE(NULLIF(raw.payload->>'EffectIndex','')::smallint,0),
			COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),COALESCE(NULLIF(raw.payload->>'Effect','')::int,0),
			COALESCE(NULLIF(raw.payload->>'EffectAura','')::int,0),NULLIF(raw.payload->>'EffectBasePointsF','')::numeric,
			COALESCE(NULLIF(NULLIF(raw.payload->>'EffectBonusCoefficient','')::numeric,0),NULLIF(raw.payload->>'Coefficient','')::numeric),
			NULLIF(raw.payload->>'BonusCoefficientFromAP','')::numeric,
			NULLIF(raw.payload->>'EffectAuraPeriod','')::int,NULLIF(raw.payload->>'EffectRadiusIndex_0','')::int,
			COALESCE(NULLIF(raw.payload->>'EffectChainTargets','')::int,0),NULLIF(raw.payload->>'EffectMechanic','')::int,'db2',
			jsonb_build_object('implicit_target_0',COALESCE(NULLIF(raw.payload->>'ImplicitTarget_0','')::int,0),
				'implicit_target_1',COALESCE(NULLIF(raw.payload->>'ImplicitTarget_1','')::int,0),
				'trigger_spell_id',COALESCE(NULLIF(raw.payload->>'EffectTriggerSpell','')::bigint,0),
				'misc_value_0',COALESCE(NULLIF(raw.payload->>'EffectMiscValue_0','')::bigint,0),
				'misc_value_1',COALESCE(NULLIF(raw.payload->>'EffectMiscValue_1','')::bigint,0),
				'raw_coefficient',COALESCE(NULLIF(raw.payload->>'Coefficient','')::numeric,0),
				'variance',COALESCE(NULLIF(raw.payload->>'Variance','')::numeric,0),
				'pvp_multiplier',COALESCE(NULLIF(raw.payload->>'PvpMultiplier','')::numeric,1))
		FROM catalog_db2_rows raw
		JOIN game_entities entity ON entity.entity_type='spell' AND entity.external_id=(raw.payload->>'SpellID')::bigint AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.latest_version_id AND version.build_id=raw.build_id
		WHERE raw.table_name='SpellEffect' AND raw.locale='en_US' AND raw.payload ? 'SpellID'
		ON CONFLICT (spell_version_id,effect_index,difficulty_id,source) DO UPDATE SET
			effect_type=EXCLUDED.effect_type,aura_type=EXCLUDED.aura_type,base_points=EXCLUDED.base_points,
			coefficient=EXCLUDED.coefficient,attack_power_coefficient=EXCLUDED.attack_power_coefficient,
			amplitude_ms=EXCLUDED.amplitude_ms,radius_index=EXCLUDED.radius_index,chain_targets=EXCLUDED.chain_targets,
			mechanic_id=EXCLUDED.mechanic_id,attributes=EXCLUDED.attributes`)
		if err != nil {
			return fmt.Errorf("rebuild DB2 spell effects: %w", err)
		}
		result.SpellEffects = command.RowsAffected()
		return nil
	})
	return result, err
}

func (i *Indexer) RebuildTooltips(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		carried, err := carryForwardOfficialLocalizations(ctx, tx)
		if err != nil {
			return err
		}
		result.Descriptions += carried
		if err := rebuildSpellRelationships(ctx, tx); err != nil {
			return err
		}
		result.Icons, err = rebuildEntityIcons(ctx, tx)
		if err != nil {
			return err
		}
		descriptions, err := rebuildCanonicalDescriptions(ctx, tx)
		if err != nil {
			return err
		}
		result.Descriptions += descriptions
		command, err := tx.Exec(ctx, tooltipSQL)
		if err != nil {
			return fmt.Errorf("rebuild entity tooltips: %w", err)
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

func (i *Indexer) RebuildDescriptions(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		carried, err := carryForwardOfficialLocalizations(ctx, tx)
		if err != nil {
			return err
		}
		canonical, err := rebuildCanonicalDescriptions(ctx, tx)
		result.Descriptions = carried + canonical
		return err
	})
	return result, err
}

func carryForwardOfficialLocalizations(ctx context.Context, tx pgx.Tx) (int64, error) {
	command, err := tx.Exec(ctx, `
		WITH source_documents AS (
			SELECT DISTINCT ON (target_version.id,document.locale)
				target_version.id AS version_id,document.locale,target.canonical_slug,
				COALESCE(NULLIF(BTRIM(document.payload->>'name'),''),
					NULLIF(BTRIM(document.payload #>> ARRAY['name',document.locale]),''),
					NULLIF(BTRIM(document.payload->>'title'),''),
					NULLIF(BTRIM(document.payload #>> '{spell,name}'),''),
					NULLIF(BTRIM(document.payload #>> ARRAY['spell','name',document.locale]),'')) AS name,
				COALESCE(NULLIF(BTRIM(document.payload->>'description'),''),
					NULLIF(BTRIM(document.payload #>> ARRAY['description',document.locale]),''),
					NULLIF(BTRIM(document.payload #>> '{rank_descriptions,0,description}'),'')) AS description,
				source_build.build_number AS source_build_number,source_build.version AS source_build_version,
				document.source_url
			FROM catalog_entity_source_documents document
			JOIN game_builds source_build ON source_build.id=document.build_id
			JOIN game_entities target ON target.entity_type=document.entity_type
				AND target.external_id=document.external_id AND target.deleted_at IS NULL
			JOIN game_entity_versions target_version ON target_version.id=target.latest_version_id
			JOIN game_builds target_build ON target_build.id=target_version.build_id
			WHERE document.source='blizzard_api' AND document.locale IN ('en_US','ru_RU')
			  AND source_build.product_id=target.product_id
			  AND source_build.build_number<=target_build.build_number
			  AND COALESCE(NULLIF(BTRIM(document.payload->>'name'),''),
				NULLIF(BTRIM(document.payload #>> ARRAY['name',document.locale]),''),
				NULLIF(BTRIM(document.payload->>'title'),''),
				NULLIF(BTRIM(document.payload #>> '{spell,name}'),''),
				NULLIF(BTRIM(document.payload #>> ARRAY['spell','name',document.locale]),'')) IS NOT NULL
			ORDER BY target_version.id,document.locale,source_build.build_number DESC,document.imported_at DESC
		)
		INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
		SELECT version_id,locale,canonical_slug,name,COALESCE(description,''),jsonb_build_object(
			'official_carry_forward',jsonb_build_object(
				'source','blizzard_api','build_number',source_build_number,
				'build_version',source_build_version,'source_url',source_url))
		FROM source_documents
		ON CONFLICT(version_id,locale) DO UPDATE SET
			name=COALESCE(NULLIF(game_entity_localizations.name,''),EXCLUDED.name),
			description=COALESCE(NULLIF(game_entity_localizations.description,''),EXCLUDED.description),
			attributes=game_entity_localizations.attributes||EXCLUDED.attributes
		WHERE NULLIF(game_entity_localizations.name,'') IS NULL
		   OR (NULLIF(game_entity_localizations.description,'') IS NULL AND NULLIF(EXCLUDED.description,'') IS NOT NULL)`)
	if err != nil {
		return 0, fmt.Errorf("carry official localizations to active build: %w", err)
	}
	return command.RowsAffected(), nil
}

func rebuildCanonicalDescriptions(ctx context.Context, tx pgx.Tx) (int64, error) {
	command, err := tx.Exec(ctx, `
		WITH candidates AS (
			SELECT target_text.version_id,target_text.locale,source_text.description
			FROM game_entity_localizations target_text
			JOIN game_entity_versions target_version ON target_version.id=target_text.version_id
			JOIN game_entities target ON target.id=target_version.entity_id AND target.latest_version_id=target_version.id
			JOIN game_entities source ON source.product_id=target.product_id AND source.entity_type='item'
				AND source.external_id=target.external_id AND source.deleted_at IS NULL
			JOIN game_entity_localizations source_text ON source_text.version_id=source.latest_version_id
				AND source_text.locale=target_text.locale
			WHERE target.entity_type IN ('gem','food','flask','potion') AND target.deleted_at IS NULL
			  AND NULLIF(target_text.description,'') IS NULL AND NULLIF(source_text.description,'') IS NOT NULL
		)
		UPDATE game_entity_localizations localized SET description=candidates.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_item_identity')
		FROM candidates WHERE localized.version_id=candidates.version_id AND localized.locale=candidates.locale;

		WITH candidates AS (
			SELECT target_text.version_id,target_text.locale,source_text.description
			FROM game_entity_localizations target_text
			JOIN game_entity_versions target_version ON target_version.id=target_text.version_id
			JOIN game_entities target ON target.id=target_version.entity_id AND target.latest_version_id=target_version.id
			JOIN game_entities source ON source.product_id=target.product_id AND source.entity_type='spell'
				AND source.external_id=CASE WHEN target_version.payload #>> '{raidbots,spellId}' ~ '^[1-9][0-9]*$'
					THEN (target_version.payload #>> '{raidbots,spellId}')::bigint END AND source.deleted_at IS NULL
			JOIN game_entity_localizations source_text ON source_text.version_id=source.latest_version_id
				AND source_text.locale=target_text.locale
			WHERE target.entity_type='enchantment' AND target.deleted_at IS NULL
			  AND target_version.payload #>> '{raidbots,spellId}' ~ '^[1-9][0-9]*$'
			  AND NULLIF(target_text.description,'') IS NULL AND NULLIF(source_text.description,'') IS NOT NULL
		)
		UPDATE game_entity_localizations localized SET description=candidates.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_spell_identity')
		FROM candidates WHERE localized.version_id=candidates.version_id AND localized.locale=candidates.locale;

		WITH candidates AS (
			SELECT target_text.version_id,target_text.locale,source_text.description
			FROM game_entity_localizations target_text
			JOIN game_entity_versions target_version ON target_version.id=target_text.version_id
			JOIN game_entities target ON target.id=target_version.entity_id AND target.latest_version_id=target_version.id
			JOIN game_entities source ON source.product_id=target.product_id AND source.entity_type='item'
				AND source.external_id=CASE WHEN target_version.payload #>> '{raidbots,itemId}' ~ '^[1-9][0-9]*$'
					THEN (target_version.payload #>> '{raidbots,itemId}')::bigint END AND source.deleted_at IS NULL
			JOIN game_entity_localizations source_text ON source_text.version_id=source.latest_version_id
				AND source_text.locale=target_text.locale
			WHERE target.entity_type='enchantment' AND target.deleted_at IS NULL
			  AND target_version.payload #>> '{raidbots,itemId}' ~ '^[1-9][0-9]*$'
			  AND NULLIF(target_text.description,'') IS NULL AND NULLIF(source_text.description,'') IS NOT NULL
		)
		UPDATE game_entity_localizations localized SET description=candidates.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_item_reference')
		FROM candidates WHERE localized.version_id=candidates.version_id AND localized.locale=candidates.locale;

		WITH candidates AS (
			SELECT target_text.version_id,target_text.locale,source_text.description
			FROM game_entity_localizations target_text
			JOIN game_entity_versions target_version ON target_version.id=target_text.version_id
			JOIN game_entities target ON target.id=target_version.entity_id AND target.latest_version_id=target_version.id
			JOIN game_entities source ON source.product_id=target.product_id AND source.entity_type='item'
				AND source.external_id=CASE WHEN target_version.payload #>> '{db2,ItemID}' ~ '^[1-9][0-9]*$'
					THEN (target_version.payload #>> '{db2,ItemID}')::bigint END AND source.deleted_at IS NULL
			JOIN game_entity_localizations source_text ON source_text.version_id=source.latest_version_id
				AND source_text.locale=target_text.locale
			WHERE target.entity_type='toy' AND target.deleted_at IS NULL
			  AND target_version.payload #>> '{db2,ItemID}' ~ '^[1-9][0-9]*$'
			  AND NULLIF(target_text.description,'') IS NULL AND NULLIF(source_text.description,'') IS NOT NULL
		)
		UPDATE game_entity_localizations localized SET description=candidates.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_item_reference')
		FROM candidates WHERE localized.version_id=candidates.version_id AND localized.locale=candidates.locale;

		WITH candidates AS (
			SELECT target_text.version_id,target_text.locale,string_agg(DISTINCT source_text.description,E'\n' ORDER BY source_text.description) AS description
			FROM game_entity_localizations target_text
			JOIN game_entity_versions target_version ON target_version.id=target_text.version_id
			JOIN game_entities target ON target.id=target_version.entity_id AND target.latest_version_id=target_version.id
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(target_version.payload #> '{raidbots,spells}','[]'::jsonb)) spell_ref
			JOIN game_entities source ON source.product_id=target.product_id AND source.entity_type='spell'
				AND source.external_id=CASE WHEN spell_ref->>'spellId' ~ '^[1-9][0-9]*$'
					THEN (spell_ref->>'spellId')::bigint END AND source.deleted_at IS NULL
			JOIN game_entity_localizations source_text ON source_text.version_id=source.latest_version_id
				AND source_text.locale=target_text.locale
			WHERE target.entity_type='item_set' AND target.deleted_at IS NULL
			  AND spell_ref->>'spellId' ~ '^[1-9][0-9]*$'
			  AND NULLIF(target_text.description,'') IS NULL AND NULLIF(source_text.description,'') IS NOT NULL
			GROUP BY target_text.version_id,target_text.locale
		)
		UPDATE game_entity_localizations localized SET description=candidates.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_set_bonus_spells')
		FROM candidates WHERE localized.version_id=candidates.version_id AND localized.locale=candidates.locale`)
	if err != nil {
		return 0, fmt.Errorf("rebuild canonical descriptions: %w", err)
	}
	return command.RowsAffected(), nil
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
		talentSQL := strings.Replace(tooltipSQL,
			"WHERE e.entity_type IN ('item','spell','talent','pvp_talent') AND e.deleted_at IS NULL",
			"WHERE e.entity_type IN ('talent','pvp_talent') AND e.deleted_at IS NULL", 1)
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

func (i *Indexer) RebuildPvpTalents(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		allDefinitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		definitions := make([]Definition, 0)
		for _, definition := range allDefinitions {
			if definition.EntityType == "pvp_talent" {
				definitions = append(definitions, definition)
			}
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `DELETE FROM game_entity_categories ec USING catalog_categories c
			WHERE c.id=ec.category_id AND c.product_id=$1 AND c.entity_type='pvp_talent'
			  AND ec.source='gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear PvP talent categories: %w", err)
		}
		for _, definition := range definitions {
			written, err := classify(ctx, tx, categoryIDs[categoryKey(definition.EntityType, definition.Path)], definition)
			if err != nil {
				return fmt.Errorf("classify PvP talents %s: %w", definition.Path, err)
			}
			result.Assignments += written
		}
		if err := rebuildSpellRelationships(ctx, tx); err != nil {
			return err
		}
		result.Icons, err = rebuildEntityIcons(ctx, tx)
		if err != nil {
			return err
		}
		pvpTooltipSQL := strings.Replace(tooltipSQL,
			"WHERE e.entity_type IN ('item','spell','talent','pvp_talent') AND e.deleted_at IS NULL",
			"WHERE e.entity_type='pvp_talent' AND e.deleted_at IS NULL", 1)
		command, err := tx.Exec(ctx, pvpTooltipSQL)
		if err != nil {
			return fmt.Errorf("rebuild PvP talent tooltips: %w", err)
		}
		result.Tooltips = command.RowsAffected()
		result.Links, err = rebuildEntityGraph(ctx, tx)
		return err
	})
	return result, err
}

func (i *Indexer) RebuildGraph(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		if err := rebuildSpellRelationships(ctx, tx); err != nil {
			return err
		}
		var err error
		result.Links, err = rebuildEntityGraph(ctx, tx)
		return err
	})
	return result, err
}

func (i *Indexer) RebuildItemsAndTooltips(ctx context.Context) (Result, error) {
	return i.rebuildItems(ctx, true)
}

func (i *Indexer) RebuildItemTaxonomy(ctx context.Context) (Result, error) {
	return i.rebuildItems(ctx, false)
}

func (i *Indexer) RebuildItemVariants(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var err error
		result.Variants, err = rebuildBaseItemVariants(ctx, tx)
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
		result.Variants, err = rebuildBaseItemVariants(ctx, tx)
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
			command, err := tx.Exec(ctx, tooltipSQL)
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

func rebuildBaseItemVariants(ctx context.Context, tx pgx.Tx) (int64, error) {
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
		return 0, fmt.Errorf("rebuild base item variants: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM catalog_item_variant_stats stats USING catalog_item_variants variant
		WHERE stats.variant_id=variant.id AND variant.variant_key='base';
		INSERT INTO catalog_item_variant_stats(variant_id,stat_index,stat_type,value,allocation,socket_cost_rate,
			stat_key,stat_label,locale,source,attributes)
		SELECT variant.id,stat.slot,stat.stat_type,NULL,stat.percent_editor,stat.socket_percentage,
			'stat_'||stat.stat_type,NULL,NULL,CASE WHEN version.source='raidbots' THEN 'raidbots' ELSE 'db2' END,
			jsonb_build_object('value_kind','scaling_allocation','source_version',version.source)
		FROM catalog_item_stats stat
		JOIN game_entity_versions version ON version.id=stat.version_id
		JOIN catalog_item_variants variant ON variant.item_version_id=stat.version_id AND variant.variant_key='base'`, pgx.QueryExecModeSimpleProtocol); err != nil {
		return 0, fmt.Errorf("rebuild canonical item variant stats: %w", err)
	}
	return command.RowsAffected(), nil
}

func rebuildEntityGraph(ctx context.Context, tx pgx.Tx) (int64, error) {
	if err := rebuildEntityMentions(ctx, tx); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		WITH matches AS (
			SELECT DISTINCT ON (source.version_id,source.source_type,source.source_id,source.context_id)
				source.version_id,source.source_type,source.source_id,source.context_id,encounter.entity_id
			FROM catalog_item_acquisition_sources source
			JOIN game_entity_versions item_version ON item_version.id=source.version_id
			JOIN catalog_journal_encounters encounter ON encounter.build_id=item_version.build_id
				AND encounter.dungeon_encounter_id=source.source_id AND encounter.entity_id IS NOT NULL
			WHERE source.source_type='encounter' AND source.source_entity_id IS NULL
			ORDER BY source.version_id,source.source_type,source.source_id,source.context_id,encounter.journal_encounter_id
		)
		UPDATE catalog_item_acquisition_sources source SET source_entity_id=matches.entity_id
		FROM matches WHERE source.version_id=matches.version_id AND source.source_type=matches.source_type
			AND source.source_id=matches.source_id AND source.context_id=matches.context_id;
		`, pgx.QueryExecModeSimpleProtocol); err != nil {
		return 0, fmt.Errorf("resolve acquisition sources: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM game_entity_links WHERE relation_type IN (
			'obtained_from','grants','modifies','replaces','teaches','uses_reagent','creates',
			'rewards','belongs_to','owned_by','mentions'
		);

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT item.id,source.source_entity_id,item_version.build_id,'obtained_from',
			jsonb_build_object('source_type',source.source_type,'source_id',source.source_id,
				'chance_percent',source.chance_percent,'difficulty_mask',source.difficulty_mask)
		FROM catalog_item_acquisition_sources source
		JOIN game_entity_versions item_version ON item_version.id=source.version_id
		JOIN game_entities item ON item.id=item_version.entity_id
		WHERE source.source_entity_id IS NOT NULL
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT talent.id,spell.id,talent_version.build_id,link.relationship,link.attributes
		FROM catalog_talent_spell_relations link
		JOIN game_entity_versions talent_version ON talent_version.id=link.talent_version_id
		JOIN game_entities talent ON talent.id=talent_version.entity_id
		JOIN game_entity_versions spell_version ON spell_version.id=link.spell_version_id
		JOIN game_entities spell ON spell.id=spell_version.entity_id
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT profession_entity.id,recipe_entity.id,profession_version.build_id,'teaches',
			jsonb_build_object('category_id',link.trade_skill_category_id,'min_skill_rank',link.min_skill_rank)
		FROM catalog_profession_recipes link
		JOIN game_entity_versions profession_version ON profession_version.id=link.profession_version_id
		JOIN game_entities profession_entity ON profession_entity.id=profession_version.entity_id
		JOIN game_entity_versions recipe_version ON recipe_version.id=link.recipe_version_id
		JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT recipe_entity.id,item.id,recipe_version.build_id,'uses_reagent',
			jsonb_build_object('slot',reagent.slot,'quantity',reagent.quantity,'recraft_quantity',reagent.recraft_quantity)
		FROM catalog_recipe_reagents reagent
		JOIN game_entity_versions recipe_version ON recipe_version.id=reagent.recipe_version_id
		JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
		JOIN game_entities item ON item.id=reagent.item_entity_id
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT recipe_entity.id,item.id,recipe_version.build_id,'creates',jsonb_build_object('source',output.source)
		FROM catalog_recipe_outputs output
		JOIN game_entity_versions recipe_version ON recipe_version.id=output.recipe_version_id
		JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
		JOIN game_entities item ON item.id=output.item_entity_id
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT quest.id,target.id,reward.build_id,'rewards',jsonb_build_object(
			'reward_type',reward.reward_type,'reward_index',reward.reward_index,'amount',reward.amount,
			'is_choice',reward.is_choice,'source',reward.source)
		FROM catalog_quest_rewards reward
		JOIN game_builds reward_build ON reward_build.id=reward.build_id
		JOIN game_entities quest ON quest.product_id=reward_build.product_id AND quest.entity_type='quest'
			AND quest.external_id=reward.quest_id AND quest.deleted_at IS NULL AND quest.latest_version_id IS NOT NULL
		JOIN game_entities target ON target.product_id=reward_build.product_id
			AND target.entity_type=CASE reward.reward_type WHEN 'reputation' THEN 'faction' ELSE reward.reward_type END
			AND target.external_id=reward.external_id AND target.deleted_at IS NULL AND target.latest_version_id IS NOT NULL
		WHERE reward.external_id IS NOT NULL
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT encounter.entity_id,instance.entity_id,encounter.build_id,'belongs_to',
			jsonb_build_object('order_index',encounter.order_index,'difficulty_mask',encounter.difficulty_mask)
		FROM catalog_journal_encounters encounter
		JOIN catalog_journal_instances instance ON instance.build_id=encounter.build_id
			AND instance.journal_instance_id=encounter.journal_instance_id
		WHERE encounter.entity_id IS NOT NULL AND instance.entity_id IS NOT NULL
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT spell.id,owner_entity.id,spell_version.build_id,'owned_by',
			owner.attributes||jsonb_build_object('owner_type',owner.owner_type,'owner_id',owner.owner_id)
		FROM catalog_spell_owners owner
		JOIN game_entity_versions spell_version ON spell_version.id=owner.spell_version_id
		JOIN game_entities spell ON spell.id=spell_version.entity_id
		JOIN game_entities owner_entity ON owner_entity.product_id=spell.product_id
			AND owner_entity.entity_type=owner.owner_type AND owner_entity.external_id=owner.owner_id
			AND owner_entity.deleted_at IS NULL
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT specialization.id,class.id,specialization_version.build_id,'belongs_to',
			jsonb_build_object('source','db2','class_id',(specialization_version.payload #>> '{db2,ClassID}')::int)
		FROM game_entities specialization
		JOIN game_entity_versions specialization_version ON specialization_version.id=specialization.latest_version_id
		JOIN game_entities class ON class.product_id=specialization.product_id AND class.entity_type='class'
			AND class.external_id=(specialization_version.payload #>> '{db2,ClassID}')::bigint AND class.deleted_at IS NULL
		WHERE specialization.entity_type='specialization' AND specialization.deleted_at IS NULL
			AND specialization_version.payload #>> '{db2,ClassID}' ~ '^[1-9][0-9]*$'
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT DISTINCT talent.id,specialization.id,talent_version.build_id,'owned_by',
			jsonb_build_object('source','raidbots','owner_type','specialization','owner_id',(appearance->>'spec_id')::int,
				'tree_kind',appearance->>'tree_kind','trait_tree_id',NULLIF(appearance->>'trait_tree_id','')::bigint)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		CROSS JOIN LATERAL jsonb_array_elements(COALESCE(talent_version.payload #> '{raidbots,appearances}','[]'::jsonb)) appearance
		JOIN game_entities specialization ON specialization.product_id=talent.product_id
			AND specialization.entity_type='specialization' AND specialization.external_id=(appearance->>'spec_id')::bigint
			AND specialization.deleted_at IS NULL
		WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL AND appearance->>'spec_id' ~ '^[1-9][0-9]*$'
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT talent.id,specialization.id,talent_version.build_id,'owned_by',
			jsonb_build_object('source','db2','owner_type','specialization','owner_id',
				(talent_version.payload #>> '{db2,SpecID}')::int)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN game_entities specialization ON specialization.product_id=talent.product_id
			AND specialization.entity_type='specialization'
			AND specialization.external_id=(talent_version.payload #>> '{db2,SpecID}')::bigint
			AND specialization.deleted_at IS NULL
		WHERE talent.entity_type='pvp_talent' AND talent.deleted_at IS NULL
			AND talent_version.payload #>> '{db2,SpecID}' ~ '^[1-9][0-9]*$'
		ON CONFLICT DO NOTHING;

		INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes)
		SELECT source_entity.id,mention.target_entity_id,source_version.build_id,'mentions',
			jsonb_build_object('source',mention.source,'locale',mention.locale,'text',mention.mention_text)
		FROM catalog_entity_mentions mention
		JOIN game_entity_versions source_version ON source_version.id=mention.source_version_id
		JOIN game_entities source_entity ON source_entity.id=source_version.entity_id
		ON CONFLICT DO NOTHING`, pgx.QueryExecModeSimpleProtocol); err != nil {
		return 0, fmt.Errorf("rebuild entity graph: %w", err)
	}
	var count int64
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM game_entity_links`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count entity graph: %w", err)
	}
	return count, nil
}

func rebuildEntityMentions(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, `
		DELETE FROM catalog_entity_mentions WHERE source IN ('verified_description_exact','canonical_description_exact');
		WITH description_matches AS MATERIALIZED (
			SELECT description.version_id AS source_version_id,description.locale,
				btrim((match.value)[1]) AS mention_text,'exact_quoted_name'::text AS match_kind
			FROM game_entity_localizations description
			JOIN game_entity_versions source_version ON source_version.id=description.version_id
			JOIN game_entities source_entity ON source_entity.id=source_version.entity_id
			CROSS JOIN LATERAL regexp_matches(description.description, '"([^"]{2,100})"', 'g') match(value)
			WHERE source_entity.latest_version_id=source_version.id
			  AND source_entity.entity_type IN ('spell','talent','pvp_talent') AND source_entity.deleted_at IS NULL
			  AND NULLIF(description.description,'') IS NOT NULL
			UNION ALL
			SELECT description.version_id,description.locale,btrim((match.value)[1]),'exact_bracketed_name'
			FROM game_entity_localizations description
			JOIN game_entity_versions source_version ON source_version.id=description.version_id
			JOIN game_entities source_entity ON source_entity.id=source_version.entity_id
			CROSS JOIN LATERAL regexp_matches(description.description, '\[([^]:]{2,100})(:|\])', 'g') match(value)
			WHERE source_entity.latest_version_id=source_version.id
			  AND source_entity.entity_type IN ('spell','talent','pvp_talent') AND source_entity.deleted_at IS NULL
			  AND NULLIF(description.description,'') IS NOT NULL
		), localized_targets AS MATERIALIZED (
			SELECT localized.locale,lower(btrim(localized.name)) AS normalized_name,entity.id,
				entity.entity_type,version.id AS target_version_id
			FROM game_entity_localizations localized
			JOIN game_entity_versions version ON version.id=localized.version_id
			JOIN game_entities entity ON entity.id=version.entity_id AND entity.latest_version_id=version.id
			WHERE entity.entity_type IN ('spell','talent','pvp_talent') AND entity.deleted_at IS NULL
				AND length(btrim(localized.name)) BETWEEN 2 AND 100
		), candidates AS MATERIALIZED (
			SELECT matched.*,target.id,target.entity_type,
				CASE WHEN EXISTS (
					SELECT 1 FROM catalog_spell_owners source_owner
					JOIN catalog_spell_owners target_owner ON target_owner.spell_version_id=target.target_version_id
						AND target_owner.owner_type=source_owner.owner_type AND target_owner.owner_id=source_owner.owner_id
					WHERE source_owner.spell_version_id=matched.source_version_id
				) THEN 0 ELSE 100 END
				+ CASE target.entity_type WHEN 'spell' THEN 0 WHEN 'talent' THEN 10 ELSE 20 END AS match_score
			FROM description_matches matched
			JOIN localized_targets target ON target.locale=matched.locale
				AND target.normalized_name=lower(matched.mention_text)
		), ranked AS MATERIALIZED (
			SELECT candidate.*,
				min(candidate.match_score) OVER (
					PARTITION BY candidate.source_version_id,candidate.locale,candidate.mention_text
				) AS best_score
			FROM candidates candidate
		), resolved AS MATERIALIZED (
			SELECT best.*,
				count(*) OVER (PARTITION BY best.source_version_id,best.locale,best.mention_text) AS best_count
			FROM ranked best WHERE best.match_score=best.best_score
		)
		INSERT INTO catalog_entity_mentions(source_version_id,locale,target_entity_id,mention_text,source,attributes)
		SELECT DISTINCT resolved.source_version_id,resolved.locale,resolved.id,resolved.mention_text,
			'canonical_description_exact',jsonb_build_object('match',resolved.match_kind,'score',resolved.match_score)
		FROM resolved WHERE resolved.best_count=1
		ON CONFLICT DO NOTHING`, pgx.QueryExecModeSimpleProtocol); err != nil {
		return fmt.Errorf("rebuild entity mentions: %w", err)
	}
	return nil
}

func (i *Indexer) RebuildRaces(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		allDefinitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		definitions := make([]Definition, 0)
		for _, definition := range allDefinitions {
			if definition.EntityType == "spell" && (definition.Facet == "race" || definition.Path == "races") {
				definitions = append(definitions, definition)
			}
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `DELETE FROM game_entity_categories ec USING catalog_categories c WHERE c.id=ec.category_id AND c.product_id=$1 AND c.entity_type='spell' AND (c.facet='race' OR c.path='races') AND ec.source='gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear race categories: %w", err)
		}
		for _, definition := range definitions {
			written, err := classify(ctx, tx, categoryIDs[categoryKey(definition.EntityType, definition.Path)], definition)
			if err != nil {
				return fmt.Errorf("classify race %s: %w", definition.Path, err)
			}
			result.Assignments += written
		}
		return nil
	})
	return result, err
}

func (i *Indexer) RebuildSpellClasses(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		allDefinitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		definitions := make([]Definition, 0)
		for _, definition := range allDefinitions {
			if definition.EntityType == "spell" && (definition.Facet == "class" || definition.Path == "classes") {
				definitions = append(definitions, definition)
			}
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `DELETE FROM game_entity_categories ec USING catalog_categories c WHERE c.id=ec.category_id AND c.product_id=$1 AND c.entity_type='spell' AND (c.facet='class' OR c.path='classes') AND ec.source='gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear spell class categories: %w", err)
		}
		for _, definition := range definitions {
			written, err := classify(ctx, tx, categoryIDs[categoryKey(definition.EntityType, definition.Path)], definition)
			if err != nil {
				return fmt.Errorf("classify spell class %s: %w", definition.Path, err)
			}
			result.Assignments += written
		}
		return nil
	})
	return result, err
}

func (i *Indexer) RebuildProfessionRecipes(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		allDefinitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		definitions := make([]Definition, 0)
		for _, definition := range allDefinitions {
			if definition.EntityType == "spell" && (definition.Facet == "profession" || definition.Path == "professions") {
				definitions = append(definitions, definition)
			}
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `DELETE FROM game_entity_categories ec USING catalog_categories c
			WHERE c.id=ec.category_id AND c.product_id=$1 AND c.entity_type='spell' AND (c.facet='profession' OR c.path='professions')`, productID); err != nil {
			return fmt.Errorf("clear profession recipe categories: %w", err)
		}
		for _, definition := range definitions {
			written, err := classify(ctx, tx, categoryIDs[categoryKey(definition.EntityType, definition.Path)], definition)
			if err != nil {
				return fmt.Errorf("classify profession recipes %s: %w", definition.Path, err)
			}
			result.Assignments += written
		}
		return nil
	})
	return result, err
}

func (i *Indexer) Rebuild(ctx context.Context) (Result, error) { return i.rebuild(ctx, true) }

func (i *Indexer) RebuildTaxonomy(ctx context.Context) (Result, error) { return i.rebuild(ctx, false) }

func (i *Indexer) rebuild(ctx context.Context, includeTooltips bool) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var productID int16
		if err := tx.QueryRow(ctx, `SELECT id FROM game_products WHERE slug = 'wow'`).Scan(&productID); err != nil {
			return fmt.Errorf("find wow product: %w", err)
		}
		definitions, err := i.definitions(ctx, tx)
		if err != nil {
			return err
		}
		categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
		if err != nil {
			return err
		}
		result.Categories = int64(len(categoryIDs))
		if _, err := tx.Exec(ctx, `
			DELETE FROM game_entity_categories ec
			USING catalog_categories c
			WHERE c.id = ec.category_id AND c.product_id = $1 AND ec.source = 'gildra_classifier'`, productID); err != nil {
			return fmt.Errorf("clear classified categories: %w", err)
		}
		for _, definition := range definitions {
			categoryID := categoryIDs[categoryKey(definition.EntityType, definition.Path)]
			written, err := classify(ctx, tx, categoryID, definition)
			if err != nil {
				return fmt.Errorf("classify %s %s: %w", definition.EntityType, definition.Path, err)
			}
			result.Assignments += written
		}
		if includeTooltips {
			carried, err := carryForwardOfficialLocalizations(ctx, tx)
			if err != nil {
				return err
			}
			result.Descriptions += carried
			canonical, err := rebuildCanonicalDescriptions(ctx, tx)
			if err != nil {
				return err
			}
			result.Descriptions += canonical
			if err := rebuildSpellRelationships(ctx, tx); err != nil {
				return err
			}
			result.Icons, err = rebuildEntityIcons(ctx, tx)
			if err != nil {
				return err
			}
			command, err := tx.Exec(ctx, tooltipSQL)
			if err != nil {
				return fmt.Errorf("rebuild entity tooltips: %w", err)
			}
			result.Tooltips = command.RowsAffected()
		}
		return nil
	})
	return result, err
}

func rebuildEntityIcons(ctx context.Context, tx pgx.Tx) (int64, error) {
	written, err := carryForwardOfficialIcons(ctx, tx)
	if err != nil {
		return 0, err
	}
	command, err := tx.Exec(ctx, `
		WITH candidates AS (
			SELECT entity.id,entity.entity_type,entity.external_id,version.build_id,version.source_artifact_id,
				asset.icon_name AS file_icon,
				NULLIF(BTRIM(version.payload #>> '{raidbots,icon}'),'') AS raidbots_icon,
				NULLIF(BTRIM(version.payload #>> '{raidbots,spellIcon}'),'') AS raidbots_spell_icon
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			LEFT JOIN catalog_file_assets asset ON asset.file_data_id=CASE
				WHEN COALESCE(NULLIF(version.payload->>'icon_file_data_id',''),
					NULLIF(version.payload->>'InventoryIconFileID',''),NULLIF(version.payload->>'IconFileID',''),
					NULLIF(version.payload->>'IconFileDataID',''),NULLIF(version.payload->>'SpellIconFileID',''),
					NULLIF(version.payload #>> '{db2,InventoryIconFileID}',''),NULLIF(version.payload #>> '{db2,IconFileID}',''),
					NULLIF(version.payload #>> '{db2,IconFileDataID}',''),NULLIF(version.payload #>> '{db2,SpellIconFileID}','')) ~ '^[1-9][0-9]*$'
				THEN COALESCE(NULLIF(version.payload->>'icon_file_data_id',''),
					NULLIF(version.payload->>'InventoryIconFileID',''),NULLIF(version.payload->>'IconFileID',''),
					NULLIF(version.payload->>'IconFileDataID',''),NULLIF(version.payload->>'SpellIconFileID',''),
					NULLIF(version.payload #>> '{db2,InventoryIconFileID}',''),NULLIF(version.payload #>> '{db2,IconFileID}',''),
					NULLIF(version.payload #>> '{db2,IconFileDataID}',''),NULLIF(version.payload #>> '{db2,SpellIconFileID}',''))::bigint END
			WHERE entity.deleted_at IS NULL
		)
		INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
		SELECT build_id,entity_type,external_id,COALESCE(file_icon,raidbots_icon,raidbots_spell_icon),source_artifact_id
		FROM candidates WHERE COALESCE(file_icon,raidbots_icon,raidbots_spell_icon) IS NOT NULL
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id
		WHERE NOT EXISTS (
			SELECT 1 FROM catalog_source_artifacts official
			WHERE official.id=catalog_entity_icons.source_artifact_id
			  AND official.source='blizzard_api'
		)`)
	if err != nil {
		return 0, fmt.Errorf("rebuild direct entity icons: %w", err)
	}
	written += command.RowsAffected()

	command, err = tx.Exec(ctx, `
		WITH icon_refs(entity_type,payload_key,target_type) AS (VALUES
			('mount'::text,'SourceSpellID'::text,'spell'::text),
			('toy'::text,'ItemID'::text,'item'::text)
		)
		INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
		SELECT version.build_id,entity.entity_type,entity.external_id,target_icon.icon_name,target_icon.source_artifact_id
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN icon_refs reference ON reference.entity_type=entity.entity_type
		JOIN game_entities target ON target.product_id=entity.product_id AND target.entity_type=reference.target_type
			AND target.external_id=CASE WHEN version.payload #>> ARRAY['db2',reference.payload_key] ~ '^[1-9][0-9]*$'
				THEN (version.payload #>> ARRAY['db2',reference.payload_key])::bigint END AND target.deleted_at IS NULL
		JOIN game_entity_versions target_version ON target_version.id=target.latest_version_id AND target_version.build_id=version.build_id
		JOIN catalog_entity_icons target_icon ON target_icon.build_id=target_version.build_id
			AND target_icon.entity_type=target.entity_type AND target_icon.external_id=target.external_id
		WHERE entity.deleted_at IS NULL
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`)
	if err != nil {
		return 0, fmt.Errorf("rebuild referenced entity icons: %w", err)
	}
	return written + command.RowsAffected(), nil
}

func carryForwardOfficialIcons(ctx context.Context, tx pgx.Tx) (int64, error) {
	command, err := tx.Exec(ctx, `
		WITH candidates AS (
			SELECT DISTINCT ON (target_version.build_id,entity.entity_type,entity.external_id)
				target_version.build_id,entity.entity_type,entity.external_id,
				source_icon.icon_name,source_icon.source_artifact_id,source_build.build_number
			FROM game_entities entity
			JOIN game_entity_versions target_version ON target_version.id=entity.latest_version_id
			JOIN game_builds target_build ON target_build.id=target_version.build_id
			JOIN catalog_entity_icons source_icon ON source_icon.entity_type=entity.entity_type
				AND source_icon.external_id=entity.external_id
			JOIN game_builds source_build ON source_build.id=source_icon.build_id
			JOIN catalog_source_artifacts artifact ON artifact.id=source_icon.source_artifact_id
			WHERE entity.deleted_at IS NULL AND artifact.source='blizzard_api'
			  AND source_build.product_id=entity.product_id
			  AND source_build.build_number<=target_build.build_number
			ORDER BY target_version.build_id,entity.entity_type,entity.external_id,source_build.build_number DESC
		)
		INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
		SELECT build_id,entity_type,external_id,icon_name,source_artifact_id FROM candidates
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`)
	if err != nil {
		return 0, fmt.Errorf("carry official icons to active build: %w", err)
	}
	return command.RowsAffected(), nil
}

func rebuildSpellRelationships(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		TRUNCATE catalog_spell_owners,catalog_talent_spell_relations,catalog_talent_spell_links;

		INSERT INTO catalog_talent_spell_links(talent_version_id,spell_version_id,relationship,source,attributes)
		SELECT talent.latest_version_id,spell.latest_version_id,'grants','raidbots',
			jsonb_build_object('talent_id',talent.external_id,'spell_id',spell.external_id,
				'max_ranks',COALESCE(NULLIF(talent_version.payload #>> '{raidbots,maxRanks}','')::int,1))
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN game_entities spell ON spell.product_id=talent.product_id AND spell.entity_type='spell'
			AND spell.external_id=(talent_version.payload #>> '{raidbots,spellId}')::bigint AND spell.deleted_at IS NULL
		WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL
		  AND talent_version.payload #>> '{raidbots,spellId}' ~ '^[0-9]+$'
		ON CONFLICT(talent_version_id) DO UPDATE SET spell_version_id=EXCLUDED.spell_version_id,
			relationship=EXCLUDED.relationship,source=EXCLUDED.source,attributes=EXCLUDED.attributes;

		INSERT INTO catalog_talent_spell_links(talent_version_id,spell_version_id,relationship,source,attributes)
		SELECT talent.latest_version_id,spell.latest_version_id,
			CASE WHEN COALESCE(NULLIF(talent_version.payload #>> '{db2,OverridesSpellID}','')::bigint,0)>0
				THEN 'replaces' ELSE 'grants' END,'db2',
			jsonb_build_object('pvp_talent_id',talent.external_id,'spell_id',spell.external_id,
				'overrides_spell_id',COALESCE(NULLIF(talent_version.payload #>> '{db2,OverridesSpellID}','')::bigint,0),
				'level_required',COALESCE(NULLIF(talent_version.payload #>> '{db2,LevelRequired}','')::int,0),
				'player_condition_id',COALESCE(NULLIF(talent_version.payload #>> '{db2,PlayerConditionID}','')::bigint,0),
				'max_ranks',1)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN game_entities spell ON spell.product_id=talent.product_id AND spell.entity_type='spell'
			AND spell.external_id=(talent_version.payload #>> '{db2,SpellID}')::bigint AND spell.deleted_at IS NULL
		WHERE talent.entity_type='pvp_talent' AND talent.deleted_at IS NULL
		  AND talent_version.payload #>> '{db2,SpellID}' ~ '^[0-9]+$'
		ON CONFLICT(talent_version_id) DO UPDATE SET spell_version_id=EXCLUDED.spell_version_id,
			relationship=EXCLUDED.relationship,source=EXCLUDED.source,attributes=EXCLUDED.attributes;

		INSERT INTO catalog_talent_spell_relations(talent_version_id,spell_version_id,relationship,source,attributes)
		SELECT talent_version_id,spell_version_id,relationship,source,attributes
		FROM catalog_talent_spell_links
		ON CONFLICT DO NOTHING;

		INSERT INTO catalog_talent_spell_relations(talent_version_id,spell_version_id,relationship,source,attributes)
		SELECT talent_version.id,target_spell.latest_version_id,'modifies','db2',jsonb_strip_nulls(jsonb_build_object(
			'definition_id',definition.row_id,'operation','overrides_spell',
			'override_name',NULLIF(definition.payload->>'OverrideName_lang',''),
			'override_subtext',NULLIF(definition.payload->>'OverrideSubtext_lang',''),
			'override_description',NULLIF(definition.payload->>'OverrideDescription_lang',''),
			'effect_points',COALESCE((SELECT jsonb_agg(jsonb_build_object(
				'effect_index',COALESCE(NULLIF(points.payload->>'EffectIndex','')::int,0),
				'operation_type',COALESCE(NULLIF(points.payload->>'OperationType','')::int,0),
				'curve_id',COALESCE(NULLIF(points.payload->>'CurveID','')::bigint,0)) ORDER BY points.row_id)
				FROM catalog_db2_rows points WHERE points.build_id=definition.build_id
				  AND points.table_name='TraitDefinitionEffectPoints' AND points.locale='en_US'
				  AND points.payload->>'TraitDefinitionID'=definition.row_id::text),'[]'::jsonb)))
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN catalog_db2_rows definition ON definition.build_id=talent_version.build_id
			AND definition.table_name='TraitDefinition' AND definition.locale='en_US'
			AND definition.row_id=(talent_version.payload #>> '{raidbots,definitionId}')::bigint
		JOIN game_entities target_spell ON target_spell.product_id=talent.product_id AND target_spell.entity_type='spell'
			AND target_spell.external_id=(definition.payload->>'OverridesSpellID')::bigint AND target_spell.deleted_at IS NULL
		WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL
		  AND talent_version.payload #>> '{raidbots,definitionId}' ~ '^[1-9][0-9]*$'
		  AND definition.payload->>'OverridesSpellID' ~ '^[1-9][0-9]*$'
		ON CONFLICT(talent_version_id,spell_version_id,relationship,source)
		DO UPDATE SET attributes=EXCLUDED.attributes;

		INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
		SELECT talent_version.id,'ru_RU',
			COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(
				COALESCE(NULLIF(definition_text.payload->>'OverrideName_lang',''),spell_text.name),
				'[^[:alnum:]]+','-','g'))),''),'talent-'||talent.external_id),
			COALESCE(NULLIF(definition_text.payload->>'OverrideName_lang',''),spell_text.name),
			COALESCE(NULLIF(definition_text.payload->>'OverrideDescription_lang',''),
				NULLIF(spell_text.description,''),''),
			english.attributes||jsonb_build_object('localization_source',
				CASE WHEN NULLIF(definition_text.payload->>'OverrideName_lang','') IS NOT NULL
					THEN 'db2_trait_definition' ELSE 'db2_linked_spell' END)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN game_entity_localizations english ON english.version_id=talent_version.id AND english.locale='en_US'
		JOIN catalog_talent_spell_links link ON link.talent_version_id=talent_version.id
		LEFT JOIN game_entity_localizations spell_text ON spell_text.version_id=link.spell_version_id AND spell_text.locale='ru_RU'
		LEFT JOIN catalog_db2_rows definition_text ON definition_text.build_id=talent_version.build_id
			AND definition_text.table_name='TraitDefinition' AND definition_text.locale='ru_RU'
			AND definition_text.row_id=CASE WHEN talent_version.payload #>> '{raidbots,definitionId}' ~ '^[1-9][0-9]*$'
				THEN (talent_version.payload #>> '{raidbots,definitionId}')::bigint END
		WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL
		  AND COALESCE(NULLIF(definition_text.payload->>'OverrideName_lang',''),NULLIF(spell_text.name,'')) IS NOT NULL
		ON CONFLICT(version_id,locale) DO NOTHING;

		WITH descriptions AS (
			SELECT talent_text.version_id,talent_text.locale,
				COALESCE(NULLIF(definition_text.payload->>'OverrideDescription_lang',''),
					NULLIF(spell_text.description,''),NULLIF(spell_fallback.description,'')) AS description
			FROM game_entity_localizations talent_text
			JOIN game_entity_versions talent_version ON talent_version.id=talent_text.version_id
			JOIN game_entities talent ON talent.id=talent_version.entity_id AND talent.latest_version_id=talent_version.id
			JOIN catalog_talent_spell_links link ON link.talent_version_id=talent_version.id
			LEFT JOIN game_entity_localizations spell_text ON spell_text.version_id=link.spell_version_id AND spell_text.locale=talent_text.locale
			LEFT JOIN game_entity_localizations spell_fallback ON spell_fallback.version_id=link.spell_version_id AND spell_fallback.locale='en_US'
			LEFT JOIN catalog_db2_rows definition_text ON definition_text.build_id=talent_version.build_id
				AND definition_text.table_name='TraitDefinition' AND definition_text.locale=talent_text.locale
				AND definition_text.row_id=CASE WHEN talent_version.payload #>> '{raidbots,definitionId}' ~ '^[1-9][0-9]*$'
					THEN (talent_version.payload #>> '{raidbots,definitionId}')::bigint END
			WHERE talent.entity_type IN ('talent','pvp_talent') AND talent.deleted_at IS NULL
		)
		UPDATE game_entity_localizations localized
		SET description=descriptions.description,
			attributes=localized.attributes||jsonb_build_object('description_source','canonical_linked_spell')
		FROM descriptions WHERE localized.version_id=descriptions.version_id AND localized.locale=descriptions.locale
		  AND NULLIF(localized.description,'') IS NULL AND NULLIF(descriptions.description,'') IS NOT NULL;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT link.spell_version_id,'specialization',(appearance->>'spec_id')::bigint,'raidbots',
			jsonb_build_object('tree_kind',appearance->>'tree_kind','trait_tree_id',appearance->>'trait_tree_id')
		FROM catalog_talent_spell_relations link
		JOIN game_entity_versions talent_version ON talent_version.id=link.talent_version_id
		CROSS JOIN LATERAL jsonb_array_elements(COALESCE(talent_version.payload #> '{raidbots,appearances}','[]')) appearance
		WHERE appearance->>'spec_id' ~ '^[0-9]+$'
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT link.spell_version_id,'specialization',
			(talent_version.payload #>> '{db2,SpecID}')::bigint,'db2',
			jsonb_build_object('talent_kind','pvp','talent_id',talent.external_id)
		FROM catalog_talent_spell_links link
		JOIN game_entity_versions talent_version ON talent_version.id=link.talent_version_id
		JOIN game_entities talent ON talent.id=talent_version.entity_id AND talent.entity_type='pvp_talent'
		WHERE talent_version.payload #>> '{db2,SpecID}' ~ '^[0-9]+$'
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT owner.spell_version_id,'class',(tree_version.payload #>> '{raidbots,classId}')::bigint,'raidbots','{}'::jsonb
		FROM catalog_spell_owners owner
		JOIN game_entities tree ON tree.entity_type='talent_tree' AND tree.external_id=owner.owner_id AND tree.deleted_at IS NULL
		JOIN game_entity_versions tree_version ON tree_version.id=tree.latest_version_id
		WHERE owner.owner_type='specialization' AND tree_version.payload #>> '{raidbots,classId}' ~ '^[0-9]+$'
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT spell.latest_version_id,'class',class_id,'db2',jsonb_build_object('skill_line_id',(ability.payload->>'SkillLine')::bigint)
		FROM catalog_db2_rows ability
		JOIN game_builds build ON build.id=ability.build_id AND build.is_active
		JOIN game_entities spell ON spell.entity_type='spell' AND spell.external_id=(ability.payload->>'Spell')::bigint AND spell.deleted_at IS NULL
		JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id AND spell_version.build_id=ability.build_id
		CROSS JOIN generate_series(1,13) class_id
		WHERE ability.table_name='SkillLineAbility' AND ability.locale='en_US'
		  AND COALESCE(NULLIF(ability.payload->>'ClassMask','')::bigint,0)>0
		  AND (((ability.payload->>'ClassMask')::bigint >> (class_id-1)) & 1)=1
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT spell.latest_version_id,'race',race.row_id,'db2',jsonb_build_object('playable_race_bit',(race.payload->>'PlayableRaceBit')::int)
		FROM catalog_db2_rows ability
		JOIN game_builds build ON build.id=ability.build_id AND build.is_active
		JOIN catalog_db2_rows race ON race.build_id=ability.build_id AND race.table_name='ChrRaces' AND race.locale='en_US'
		JOIN game_entities spell ON spell.entity_type='spell' AND spell.external_id=(ability.payload->>'Spell')::bigint AND spell.deleted_at IS NULL
		JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id AND spell_version.build_id=ability.build_id
		WHERE ability.table_name='SkillLineAbility' AND ability.locale='en_US'
		  AND (race.payload->>'PlayableRaceBit')::int>=0
		  AND CASE WHEN (race.payload->>'PlayableRaceBit')::int<64
			THEN (((ability.payload->>'RaceMasks_0')::bigint >> (race.payload->>'PlayableRaceBit')::int) & 1)=1
			ELSE (((ability.payload->>'RaceMasks_1')::bigint >> ((race.payload->>'PlayableRaceBit')::int-64)) & 1)=1 END
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING;

		INSERT INTO catalog_spell_owners(spell_version_id,owner_type,owner_id,source,attributes)
		SELECT DISTINCT spell.latest_version_id,'profession',profession.skill_line_id,'db2','{}'::jsonb
		FROM catalog_db2_rows ability
		JOIN game_builds build ON build.id=ability.build_id AND build.is_active
		JOIN catalog_professions profession ON profession.skill_line_id=(ability.payload->>'SkillLine')::bigint
		JOIN game_entity_versions profession_version ON profession_version.id=profession.version_id AND profession_version.build_id=ability.build_id
		JOIN game_entities spell ON spell.entity_type='spell' AND spell.external_id=(ability.payload->>'Spell')::bigint AND spell.deleted_at IS NULL
		JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id AND spell_version.build_id=ability.build_id
		WHERE ability.table_name='SkillLineAbility' AND ability.locale='en_US'
		ON CONFLICT(spell_version_id,owner_type,owner_id,source) DO NOTHING`, pgx.QueryExecModeSimpleProtocol)
	if err != nil {
		return fmt.Errorf("rebuild spell relationships: %w", err)
	}
	return nil
}

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
	definitions = appendUnique(definitions, Definition{EntityType: "spell", Facet: "group", Slug: "professions", Path: "professions", NameEN: "Professions & Crafting", NameRU: "Профессии и ремесло", SortOrder: 30})
	for professionRows.Next() {
		var skillLineID, sortOrder int64
		var nameEN, nameRU string
		if err := professionRows.Scan(&skillLineID, &nameEN, &nameRU, &sortOrder); err != nil {
			return nil, fmt.Errorf("scan profession recipe taxonomy: %w", err)
		}
		slug := slugify(nameEN)
		definitions = appendUnique(definitions, Definition{EntityType: "spell", Facet: "profession", Slug: slug,
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
	case "spell":
		if definition.Facet == "profession" {
			command, err = tx.Exec(ctx, categoryInsertPrefix+`
				SELECT link.recipe_version_id,$1::bigint,'gildra_classifier'
				FROM catalog_profession_recipes link
				JOIN catalog_professions profession ON profession.version_id=link.profession_version_id
				WHERE profession.skill_line_id=$2
				ON CONFLICT(version_id,category_id) DO NOTHING`, categoryID, intAttribute(attributes, "skill_line_id"))
			break
		}
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

const tooltipSQL = `
	WITH spell_misc_rows AS MATERIALIZED (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellMisc' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'DifficultyID','')::int,0),row_id
	), spell_cooldown_rows AS MATERIALIZED (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellCooldowns' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'DifficultyID','')::int,0),row_id
	), spell_power_rows AS MATERIALIZED (
		SELECT DISTINCT ON (build_id,(payload->>'SpellID')::bigint)
			build_id,(payload->>'SpellID')::bigint AS spell_id,payload
		FROM catalog_db2_rows
		WHERE table_name='SpellPower' AND locale='en_US' AND payload ? 'SpellID'
		ORDER BY build_id,(payload->>'SpellID')::bigint,COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),row_id
	), item_effect_rows AS MATERIALIZED (
		SELECT links.build_id,(links.payload->>'ItemID')::bigint AS item_id,spell_text.locale,
			jsonb_agg(jsonb_build_object(
				'type','effect','trigger',COALESCE(NULLIF(effect.payload->>'TriggerType','')::int,0),
				'spell_id',COALESCE(NULLIF(effect.payload->>'SpellID','')::bigint,0),
				'text',spell_text.payload->>'Description_lang'
			) ORDER BY COALESCE(NULLIF(effect.payload->>'LegacySlotIndex','')::int,0),links.row_id) AS effects
		FROM catalog_db2_rows links
		JOIN catalog_db2_rows effect ON effect.build_id=links.build_id AND effect.table_name='ItemEffect' AND effect.locale='en_US'
			AND effect.row_id=(links.payload->>'ItemEffectID')::bigint
		JOIN catalog_db2_rows spell_text ON spell_text.build_id=links.build_id AND spell_text.table_name='Spell'
			AND spell_text.row_id=(effect.payload->>'SpellID')::bigint AND spell_text.locale IN ('en_US','ru_RU')
		WHERE links.table_name='ItemXItemEffect' AND links.locale='en_US'
			AND NULLIF(spell_text.payload->>'Description_lang','') IS NOT NULL
		GROUP BY links.build_id,(links.payload->>'ItemID')::bigint,spell_text.locale
	), item_acquisition_rows AS MATERIALIZED (
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
	), spell_owner_rows AS MATERIALIZED (
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
	), spell_talent_rows AS MATERIALIZED (
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
		WHERE e.entity_type IN ('item','spell','talent','pvp_talent') AND e.deleted_at IS NULL
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
