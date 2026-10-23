package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// RebuildQuestRewards carries the newest official reward facts into a newer
// active DB2 build without pretending that Battle.net published that build.
// source_build_id and source_artifact_id retain both provenance dimensions.
func (i *Indexer) RebuildQuestRewards(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_quest_rewards
			SET source_build_id=build_id
			WHERE source='blizzard_api' AND source_build_id IS NULL`); err != nil {
			return fmt.Errorf("backfill native quest reward build: %w", err)
		}
		command, err := tx.Exec(ctx, `
			WITH target_builds AS MATERIALIZED (
				SELECT build.id,build.product_id,build.build_number,build.version
				FROM game_builds build
				WHERE build.is_active
			), candidates AS MATERIALIZED (
				SELECT DISTINCT ON (target.id,reward.quest_id,reward.reward_type,reward.reward_index)
					target.id AS build_id,reward.quest_id,reward.reward_type,reward.reward_index,
					reward.external_id,reward.item_entity_id,reward.amount,reward.is_choice,reward.source,
					reward.attributes || jsonb_build_object(
						'carried_from_build_id',source_build.id,
						'carried_from_build_number',source_build.build_number,
						'carried_from_build_version',source_build.version) AS attributes,
					reward.source_artifact_id,source_build.id AS source_build_id
				FROM target_builds target
				JOIN catalog_quest_registry registry ON registry.build_id=target.id
				JOIN game_builds source_build ON source_build.product_id=target.product_id
					AND source_build.build_number<=target.build_number
				JOIN catalog_quest_rewards reward ON reward.build_id=source_build.id
					AND reward.quest_id=registry.quest_id AND reward.source='blizzard_api'
					AND reward.source_build_id=reward.build_id
				ORDER BY target.id,reward.quest_id,reward.reward_type,reward.reward_index,
					source_build.build_number DESC
			), removed AS (
				DELETE FROM catalog_quest_rewards stored
				USING target_builds target
				WHERE stored.build_id=target.id AND stored.source='blizzard_api'
				  AND stored.source_build_id IS DISTINCT FROM stored.build_id
				  AND NOT EXISTS (SELECT 1 FROM candidates candidate
					WHERE candidate.build_id=stored.build_id AND candidate.quest_id=stored.quest_id
					  AND candidate.reward_type=stored.reward_type AND candidate.reward_index=stored.reward_index)
			)
			INSERT INTO catalog_quest_rewards(
				build_id,quest_id,reward_type,reward_index,external_id,item_entity_id,
				amount,is_choice,source,attributes,source_artifact_id,source_build_id)
			SELECT build_id,quest_id,reward_type,reward_index,external_id,item_entity_id,
				amount,is_choice,source,attributes,source_artifact_id,source_build_id
			FROM candidates
			WHERE source_build_id<>build_id
			ON CONFLICT(build_id,quest_id,reward_type,reward_index) DO UPDATE SET
				external_id=EXCLUDED.external_id,item_entity_id=EXCLUDED.item_entity_id,
				amount=EXCLUDED.amount,is_choice=EXCLUDED.is_choice,source=EXCLUDED.source,
				attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id,
				source_build_id=EXCLUDED.source_build_id`)
		if err != nil {
			return fmt.Errorf("carry official quest rewards: %w", err)
		}
		result.QuestRewards = command.RowsAffected()
		return nil
	})
	return result, err
}

func (i *Indexer) RebuildSpellEffects(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		command, err := tx.Exec(ctx, `
			WITH spell_versions AS MATERIALIZED (
				SELECT entity.external_id,version.id AS version_id,version.build_id
				FROM game_entities entity
				JOIN game_entity_versions version ON version.id=entity.latest_version_id
				WHERE entity.entity_type='spell' AND entity.deleted_at IS NULL
			), misc AS MATERIALIZED (
				SELECT DISTINCT ON (raw.build_id,(raw.payload->>'SpellID')::bigint)
					raw.build_id,(raw.payload->>'SpellID')::bigint AS spell_id,raw.payload,raw.source_artifact_id
				FROM catalog_db2_rows raw
				WHERE raw.table_name='SpellMisc' AND raw.locale='en_US' AND raw.payload ? 'SpellID'
				ORDER BY raw.build_id,(raw.payload->>'SpellID')::bigint,
					COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id
			), cooldown AS MATERIALIZED (
				SELECT DISTINCT ON (raw.build_id,(raw.payload->>'SpellID')::bigint)
					raw.build_id,(raw.payload->>'SpellID')::bigint AS spell_id,raw.payload,raw.source_artifact_id
				FROM catalog_db2_rows raw
				WHERE raw.table_name='SpellCooldowns' AND raw.locale='en_US' AND raw.payload ? 'SpellID'
				ORDER BY raw.build_id,(raw.payload->>'SpellID')::bigint,
					COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id
			)
			INSERT INTO catalog_spells(
				version_id,school,school_mask,cast_time,cast_time_ms,cooldown_ms,min_range,max_range,
				misc_source_artifact_id,cast_time_source_artifact_id,cooldown_source_artifact_id,
				range_source_artifact_id
			)
			SELECT spell.version_id,
				NULLIF(concat_ws('+',
					CASE WHEN school.mask & 1 <> 0 THEN 'physical' END,
					CASE WHEN school.mask & 2 <> 0 THEN 'holy' END,
					CASE WHEN school.mask & 4 <> 0 THEN 'fire' END,
					CASE WHEN school.mask & 8 <> 0 THEN 'nature' END,
					CASE WHEN school.mask & 16 <> 0 THEN 'frost' END,
					CASE WHEN school.mask & 32 <> 0 THEN 'shadow' END,
					CASE WHEN school.mask & 64 <> 0 THEN 'arcane' END
				),'') AS school,
				NULLIF(school.mask,0),
				CASE WHEN cast_row.payload IS NULL THEN NULL
					WHEN COALESCE(NULLIF(cast_row.payload->>'Base','')::int,0)=0 THEN 'Instant'
					ELSE GREATEST((cast_row.payload->>'Base')::int,0)::text || ' ms' END,
				CASE WHEN cast_row.payload IS NULL THEN NULL
					ELSE GREATEST(COALESCE(NULLIF(cast_row.payload->>'Base','')::int,0),0) END,
				CASE WHEN cooldown.payload IS NULL THEN NULL ELSE GREATEST(
					COALESCE(NULLIF(cooldown.payload->>'RecoveryTime','')::int,0),
					COALESCE(NULLIF(cooldown.payload->>'CategoryRecoveryTime','')::int,0),
					COALESCE(NULLIF(cooldown.payload->>'StartRecoveryTime','')::int,0)) END,
				CASE WHEN range_row.payload IS NULL THEN NULL
					ELSE COALESCE(NULLIF(range_row.payload->>'RangeMin_0','')::double precision,0) END,
				CASE WHEN range_row.payload IS NULL THEN NULL
					ELSE COALESCE(NULLIF(range_row.payload->>'RangeMax_0','')::double precision,0) END,
				misc.source_artifact_id,cast_row.source_artifact_id,cooldown.source_artifact_id,
				range_row.source_artifact_id
			FROM spell_versions spell
			LEFT JOIN misc ON misc.build_id=spell.build_id AND misc.spell_id=spell.external_id
			CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(misc.payload->>'SchoolMask','')::int,0) AS mask) school
			LEFT JOIN catalog_db2_rows cast_row ON cast_row.build_id=spell.build_id
				AND cast_row.table_name='SpellCastTimes' AND cast_row.locale='en_US'
				AND cast_row.row_id=COALESCE(NULLIF(misc.payload->>'CastingTimeIndex','')::bigint,0)
			LEFT JOIN catalog_db2_rows range_row ON range_row.build_id=spell.build_id
				AND range_row.table_name='SpellRange' AND range_row.locale='en_US'
				AND range_row.row_id=COALESCE(NULLIF(misc.payload->>'RangeIndex','')::bigint,0)
			LEFT JOIN cooldown ON cooldown.build_id=spell.build_id AND cooldown.spell_id=spell.external_id
			ON CONFLICT(version_id) DO UPDATE SET
				school=EXCLUDED.school,school_mask=EXCLUDED.school_mask,
				cast_time=EXCLUDED.cast_time,cast_time_ms=EXCLUDED.cast_time_ms,
				cooldown_ms=EXCLUDED.cooldown_ms,min_range=EXCLUDED.min_range,max_range=EXCLUDED.max_range,
				misc_source_artifact_id=EXCLUDED.misc_source_artifact_id,
				cast_time_source_artifact_id=EXCLUDED.cast_time_source_artifact_id,
				cooldown_source_artifact_id=EXCLUDED.cooldown_source_artifact_id,
				range_source_artifact_id=EXCLUDED.range_source_artifact_id`)
		if err != nil {
			return fmt.Errorf("rebuild DB2 spell details: %w", err)
		}
		result.SpellDetails = command.RowsAffected()
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_spell_effects WHERE source='db2'`); err != nil {
			return fmt.Errorf("clear DB2 spell effects: %w", err)
		}
		command, err = tx.Exec(ctx, `INSERT INTO catalog_spell_effects(
			spell_version_id,effect_index,difficulty_id,effect_type,aura_type,base_points,coefficient,
			attack_power_coefficient,amplitude_ms,radius_index,chain_targets,mechanic_id,source,attributes,source_artifact_id)
		SELECT version.id,COALESCE(NULLIF(raw.payload->>'EffectIndex','')::smallint,0),
			COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),COALESCE(NULLIF(raw.payload->>'Effect','')::int,0),
			COALESCE(NULLIF(raw.payload->>'EffectAura','')::int,0),NULLIF(raw.payload->>'EffectBasePointsF','')::numeric,
			COALESCE(NULLIF(NULLIF(raw.payload->>'EffectBonusCoefficient','')::numeric,0),NULLIF(raw.payload->>'Coefficient','')::numeric),
			NULLIF(raw.payload->>'BonusCoefficientFromAP','')::numeric,
			NULLIF(raw.payload->>'EffectAuraPeriod','')::int,NULLIF(raw.payload->>'EffectRadiusIndex_0','')::int,
			COALESCE(NULLIF(raw.payload->>'EffectChainTargets','')::int,0),NULLIF(raw.payload->>'EffectMechanic','')::int,'db2',
			jsonb_build_object('implicit_target_0',COALESCE(NULLIF(raw.payload->>'ImplicitTarget_0','')::int,0),
				'implicit_target_1',COALESCE(NULLIF(raw.payload->>'ImplicitTarget_1','')::int,0),
				'radius_index_0',COALESCE(NULLIF(raw.payload->>'EffectRadiusIndex_0','')::int,0),
				'radius_index_1',COALESCE(NULLIF(raw.payload->>'EffectRadiusIndex_1','')::int,0),
				'trigger_spell_id',COALESCE(NULLIF(raw.payload->>'EffectTriggerSpell','')::bigint,0),
				'misc_value_0',COALESCE(NULLIF(raw.payload->>'EffectMiscValue_0','')::bigint,0),
				'misc_value_1',COALESCE(NULLIF(raw.payload->>'EffectMiscValue_1','')::bigint,0),
				'raw_coefficient',COALESCE(NULLIF(raw.payload->>'Coefficient','')::numeric,0),
				'variance',COALESCE(NULLIF(raw.payload->>'Variance','')::numeric,0),
				'pvp_multiplier',COALESCE(NULLIF(raw.payload->>'PvpMultiplier','')::numeric,1)),raw.source_artifact_id
		FROM catalog_db2_rows raw
		JOIN game_entities entity ON entity.entity_type='spell' AND entity.external_id=(raw.payload->>'SpellID')::bigint AND entity.deleted_at IS NULL
		JOIN game_entity_versions version ON version.id=entity.latest_version_id AND version.build_id=raw.build_id
		WHERE raw.table_name='SpellEffect' AND raw.locale='en_US' AND raw.payload ? 'SpellID'
		ON CONFLICT (spell_version_id,effect_index,difficulty_id,source) DO UPDATE SET
			effect_type=EXCLUDED.effect_type,aura_type=EXCLUDED.aura_type,base_points=EXCLUDED.base_points,
			coefficient=EXCLUDED.coefficient,attack_power_coefficient=EXCLUDED.attack_power_coefficient,
			amplitude_ms=EXCLUDED.amplitude_ms,radius_index=EXCLUDED.radius_index,chain_targets=EXCLUDED.chain_targets,
			mechanic_id=EXCLUDED.mechanic_id,attributes=EXCLUDED.attributes,
			source_artifact_id=EXCLUDED.source_artifact_id`)
		if err != nil {
			return fmt.Errorf("rebuild DB2 spell effects: %w", err)
		}
		result.SpellEffects = command.RowsAffected()
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
		pvpTooltipSQL := tooltipSQLForEntityTypes("pvp_talent")
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
