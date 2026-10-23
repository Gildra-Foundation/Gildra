package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

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
		SELECT recipe_entity.id,spell_entity.id,recipe_version.build_id,'teaches',
			jsonb_build_object('kind','recipe_spell')
		FROM catalog_recipes recipe
		JOIN game_entity_versions recipe_version ON recipe_version.id=recipe.version_id
		JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
		JOIN game_entity_versions spell_version ON spell_version.id=recipe.source_spell_version_id
		JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id
		WHERE recipe.source_spell_version_id IS NOT NULL
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

		-- The Russian talent text is copied from DB2 (TraitDefinition override
		-- or the linked spell), so the talent localization must cite that DB2
		-- artifact: without the link 2,889 talents failed
		-- russian_localization_provenance in 12.1.0.69587.
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		SELECT DISTINCT talent_version.id,'ru_RU',
			COALESCE(definition_text.source_artifact_id,spell_proof.source_artifact_id)
		FROM game_entities talent
		JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
		JOIN game_entity_localizations russian ON russian.version_id=talent_version.id AND russian.locale='ru_RU'
		LEFT JOIN catalog_db2_rows definition_text ON definition_text.build_id=talent_version.build_id
			AND definition_text.table_name='TraitDefinition' AND definition_text.locale='ru_RU'
			AND definition_text.row_id=CASE WHEN talent_version.payload #>> '{raidbots,definitionId}' ~ '^[1-9][0-9]*$'
				THEN (talent_version.payload #>> '{raidbots,definitionId}')::bigint END
			AND NULLIF(definition_text.payload->>'OverrideName_lang','') IS NOT NULL
		LEFT JOIN LATERAL (
			SELECT proof.source_artifact_id
			FROM catalog_talent_spell_links link
			JOIN catalog_entity_localization_artifacts proof ON proof.version_id=link.spell_version_id AND proof.locale='ru_RU'
			JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
			WHERE link.talent_version_id=talent_version.id AND artifact.status='ready'
			  AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
			ORDER BY proof.observed_at DESC LIMIT 1
		) spell_proof ON true
		WHERE talent.entity_type='talent' AND talent.deleted_at IS NULL
		  AND russian.attributes->>'localization_source' IN ('db2_trait_definition','db2_linked_spell')
		  AND COALESCE(definition_text.source_artifact_id,spell_proof.source_artifact_id) IS NOT NULL
		ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING;

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
