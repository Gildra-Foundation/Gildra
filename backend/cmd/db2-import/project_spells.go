package main

import (
	"context"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func projectSpells(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_spells ON COMMIT DROP AS
			SELECT names.row_id AS external_id, names.source_url,names.source_artifact_id,
				names.payload->>'Name_lang' AS name_en,
				COALESCE(NULLIF(names_ru.payload->>'Name_lang',''),names.payload->>'Name_lang') AS name_ru,
				COALESCE(text_en.payload->>'Description_lang','') AS description_en,
				COALESCE(NULLIF(text_ru.payload->>'Description_lang',''),text_en.payload->>'Description_lang','') AS description_ru,
				COALESCE(text_en.payload->>'NameSubtext_lang','') AS subtext_en,
				COALESCE(NULLIF(text_ru.payload->>'NameSubtext_lang',''),text_en.payload->>'NameSubtext_lang','') AS subtext_ru,
				COALESCE(text_en.payload->>'AuraDescription_lang','') AS aura_en,
				COALESCE(NULLIF(text_ru.payload->>'AuraDescription_lang',''),text_en.payload->>'AuraDescription_lang','') AS aura_ru,
				names.payload AS db2_en,COALESCE(names_ru.payload,names.payload) AS db2_ru
			FROM catalog_db2_rows names
			LEFT JOIN catalog_db2_rows names_ru ON names_ru.build_id=names.build_id AND names_ru.table_name='SpellName' AND names_ru.locale='ru_RU' AND names_ru.row_id=names.row_id
			LEFT JOIN catalog_db2_rows text_en ON text_en.build_id=names.build_id AND text_en.table_name='Spell' AND text_en.locale='en_US' AND text_en.row_id=names.row_id
			LEFT JOIN catalog_db2_rows text_ru ON text_ru.build_id=names.build_id AND text_ru.table_name='Spell' AND text_ru.locale='ru_RU' AND text_ru.row_id=names.row_id
			WHERE names.build_id=$1 AND names.table_name='SpellName' AND names.locale='en_US'
			  AND NULLIF(BTRIM(names.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID); err != nil {
			return fmt.Errorf("stage spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			ALTER TABLE projected_spells ADD COLUMN payload_en JSONB;
			UPDATE projected_spells SET payload_en=jsonb_build_object(
				'id',external_id,'name',name_en,'description',description_en,'subtext',subtext_en,'aura_description',aura_en,'db2',db2_en);
			ALTER TABLE projected_spells ADD COLUMN content_hash BYTEA;
			UPDATE projected_spells SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_spells_id_idx ON projected_spells(external_id)`); err != nil {
			return fmt.Errorf("prepare spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities (product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'spell',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),$3,$3
			FROM projected_spells
			ON CONFLICT (product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert spell entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions (entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.payload_en,p.source_url,$3,p.source_artifact_id
			FROM projected_spells p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='spell' AND e.external_id=p.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("upsert spell versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_spell_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_spells p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='spell' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash`, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("map projected spell versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations (version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),
				name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'subtext',subtext_en,'aura_description',aura_en,'db2',db2_en)
			FROM projected_spell_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'spell-'||external_id),
				name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'subtext',subtext_ru,'aura_description',aura_ru,'db2',db2_ru)
			FROM projected_spell_versions
			ON CONFLICT (version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize projected spells: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_spell_versions p
			WHERE e.id=p.entity_id AND COALESCE((SELECT b.build_number FROM game_entity_versions current_version JOIN game_builds b ON b.id=current_version.build_id WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT b.build_number FROM game_builds b WHERE b.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate projected spells: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectProfessions(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_professions ON COMMIT DROP AS
			SELECT skill.row_id AS external_id,skill.payload AS db2_en,
				COALESCE(skill_ru.payload,skill.payload) AS db2_ru,skill.content_hash,skill.source_url,skill.source_artifact_id
			FROM catalog_db2_rows skill
			LEFT JOIN catalog_db2_rows skill_ru ON skill_ru.build_id=skill.build_id
				AND skill_ru.table_name='SkillLine' AND skill_ru.locale='ru_RU' AND skill_ru.row_id=skill.row_id
			WHERE skill.build_id=$1 AND skill.table_name='SkillLine' AND skill.locale='en_US'
			  AND NULLIF(BTRIM(skill.payload->>'DisplayName_lang'),'') IS NOT NULL
			  AND (
				COALESCE(NULLIF(skill.payload->>'CategoryID','')::int,0)=11
				OR skill.row_id IN (129,185,356,2851)
				OR EXISTS (
				SELECT 1 FROM catalog_db2_rows ability
				WHERE ability.build_id=skill.build_id AND ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND NULLIF(ability.payload->>'SkillLine','')::bigint=skill.row_id
				  AND COALESCE(NULLIF(ability.payload->>'TradeSkillCategoryID','')::int,0)>0
				)
			  );
			CREATE UNIQUE INDEX projected_professions_id_idx ON projected_professions(external_id)`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("stage professions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'profession',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),$3,$3
			FROM projected_professions
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`,
			ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert profession entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.db2_en,p.source_url,$3,p.source_artifact_id
			FROM projected_professions p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='profession' AND e.external_id=p.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("version professions: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_profession_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_professions p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='profession' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash;
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),
				db2_en->>'DisplayName_lang',COALESCE(db2_en->>'Description_lang',''),db2_en FROM projected_profession_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_ru->>'DisplayName_lang','[^[:alnum:]]+','-','g'))),''),'profession-'||external_id),
				COALESCE(NULLIF(db2_ru->>'DisplayName_lang',''),db2_en->>'DisplayName_lang'),
				COALESCE(NULLIF(db2_ru->>'Description_lang',''),db2_en->>'Description_lang',''),db2_ru FROM projected_profession_versions
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes;
			INSERT INTO catalog_professions(version_id,skill_line_id,parent_skill_line_id,category_id,parent_tier_index,icon_file_data_id,can_link,flags)
			SELECT version_id,external_id,NULLIF(COALESCE(NULLIF(db2_en->>'ParentSkillLineID','')::int,0),0),COALESCE(NULLIF(db2_en->>'CategoryID','')::int,0),
				NULLIF(db2_en->>'ParentTierIndex','')::int,NULLIF(COALESCE(NULLIF(db2_en->>'SpellIconFileID','')::bigint,0),0),
				COALESCE(NULLIF(db2_en->>'CanLink','')::int,0)<>0,COALESCE(NULLIF(db2_en->>'Flags','')::bigint,0)
			FROM projected_profession_versions
			ON CONFLICT(version_id) DO UPDATE SET parent_skill_line_id=EXCLUDED.parent_skill_line_id,category_id=EXCLUDED.category_id,
				parent_tier_index=EXCLUDED.parent_tier_index,icon_file_data_id=EXCLUDED.icon_file_data_id,can_link=EXCLUDED.can_link,flags=EXCLUDED.flags;
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_profession_versions p
			WHERE e.id=p.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2)`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project professions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_trade_skill_categories(build_id,external_id,parent_external_id,skill_line_id,order_index,flags)
			SELECT row.build_id,row.row_id,NULLIF(COALESCE(NULLIF(row.payload->>'ParentTradeSkillCategoryID','')::int,0),0),
				NULLIF(row.payload->>'SkillLineID','')::int,COALESCE(NULLIF(row.payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0)
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='TradeSkillCategory' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'SkillLineID','')::int,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET parent_external_id=EXCLUDED.parent_external_id,
				skill_line_id=EXCLUDED.skill_line_id,order_index=EXCLUDED.order_index,flags=EXCLUDED.flags;
			INSERT INTO catalog_trade_skill_category_localizations(category_id,locale,name)
			SELECT category.id,row.locale,row.payload->>'Name_lang'
			FROM catalog_db2_rows row JOIN catalog_trade_skill_categories category
			  ON category.build_id=row.build_id AND category.external_id=row.row_id
			WHERE row.build_id=$1 AND row.table_name='TradeSkillCategory' AND row.locale IN ('en_US','ru_RU')
			  AND NULLIF(BTRIM(row.payload->>'Name_lang'),'') IS NOT NULL
			ON CONFLICT(category_id,locale) DO UPDATE SET name=EXCLUDED.name`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project trade skill categories: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_recipes ON COMMIT DROP AS
			WITH recipe_sources AS (
				SELECT (ability.payload->>'Spell')::bigint AS external_id,
					jsonb_build_object(
						'SpellID',(ability.payload->>'Spell')::bigint,
						'SkillLineIDs',jsonb_agg(DISTINCT (ability.payload->>'SkillLine')::bigint
							ORDER BY (ability.payload->>'SkillLine')::bigint),
						'TradeSkillCategoryIDs',jsonb_agg(DISTINCT (ability.payload->>'TradeSkillCategoryID')::bigint
							ORDER BY (ability.payload->>'TradeSkillCategoryID')::bigint)
					) AS db2,
					MIN(ability.source_url) AS source_url,
					MIN(ability.source_artifact_id::text)::uuid AS source_artifact_id
				FROM catalog_db2_rows ability
				JOIN projected_profession_versions profession
					ON profession.external_id=(ability.payload->>'SkillLine')::bigint
				WHERE ability.build_id=$2 AND ability.table_name='SkillLineAbility' AND ability.locale='en_US'
				  AND (COALESCE(NULLIF(ability.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(ability.payload->>'Spell')::bigint)
				  ))
				  AND COALESCE(NULLIF(ability.payload->>'Spell','')::bigint,0)>0
				GROUP BY (ability.payload->>'Spell')::bigint
			)
			SELECT source.external_id,source.db2,
				jsonb_build_object('kind','recipe','spell_id',source.external_id,'db2',source.db2) AS payload,
				digest(convert_to(jsonb_build_object('kind','recipe','spell_id',source.external_id,'db2',source.db2)::text,'UTF8'),'sha256') AS content_hash,
				source.source_url,source.source_artifact_id,spell.id AS spell_entity_id,
				spell.latest_version_id AS spell_version_id,spell.canonical_slug
			FROM recipe_sources source
			JOIN game_entities spell ON spell.product_id=$1 AND spell.entity_type='spell'
				AND spell.external_id=source.external_id AND spell.deleted_at IS NULL
			JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id
				AND spell_version.build_id=$2;
			CREATE UNIQUE INDEX projected_recipes_id_idx ON projected_recipes(external_id);

			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$4,'recipe',external_id,canonical_slug,$2,$2,NULL,now()
			FROM projected_recipes
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET
				namespace_id=EXCLUDED.namespace_id,canonical_slug=EXCLUDED.canonical_slug,
				last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

			INSERT INTO game_entity_versions(
				entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,
				recipe.content_hash,recipe.payload,recipe.source_url,$3,recipe.source_artifact_id
			FROM projected_recipes recipe
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='recipe'
				AND entity.external_id=recipe.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2 AND old.content_hash=recipe.content_hash);

			CREATE TEMP TABLE projected_recipe_versions ON COMMIT DROP AS
			SELECT recipe.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_recipes recipe
			JOIN game_entities entity ON entity.product_id=$1 AND entity.entity_type='recipe'
				AND entity.external_id=recipe.external_id
			JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
				WHERE candidate.entity_id=entity.id AND candidate.build_id=$2
					AND candidate.content_hash=recipe.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) version ON true;

			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT recipe.version_id,localized.locale,localized.slug,localized.name,localized.description,
				localized.attributes || jsonb_build_object('source_spell_version_id',recipe.spell_version_id)
			FROM projected_recipe_versions recipe
			JOIN game_entity_localizations localized ON localized.version_id=recipe.spell_version_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes;

			UPDATE game_entities entity SET latest_version_id=recipe.version_id,updated_at=now()
			FROM projected_recipe_versions recipe
			WHERE entity.id=recipe.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2);

			DELETE FROM catalog_profession_recipes link USING game_entity_versions version,game_entities entity
			WHERE link.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_reagents reagent USING game_entity_versions version,game_entities entity
			WHERE reagent.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_currencies currency USING game_entity_versions version,game_entities entity
			WHERE currency.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipe_outputs output USING game_entity_versions version,game_entities entity
			WHERE output.recipe_version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell';
			DELETE FROM catalog_recipes recipe USING game_entity_versions version,game_entities entity
			WHERE recipe.version_id=version.id AND version.entity_id=entity.id
				AND version.build_id=$2 AND entity.entity_type='spell'`,
			pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID, ic.SnapshotID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project recipe entities: %w", err)
		}
		command, err = tx.Exec(ctx, `
			WITH abilities AS (
				SELECT row.payload FROM catalog_db2_rows row
				WHERE row.build_id=$2 AND row.table_name='SkillLineAbility' AND row.locale='en_US'
				  AND (COALESCE(NULLIF(row.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(row.payload->>'Spell')::bigint)
				  ))
			), mapped AS (
				SELECT profession_version.version_id AS profession_version_id,recipe_version.version_id AS recipe_version_id,
					category.id AS category_id,ability.payload
				FROM abilities ability
				JOIN projected_profession_versions profession_version ON profession_version.external_id=(ability.payload->>'SkillLine')::bigint
				JOIN projected_recipe_versions recipe_version ON recipe_version.external_id=(ability.payload->>'Spell')::bigint
				LEFT JOIN catalog_trade_skill_categories category ON category.build_id=$2 AND category.external_id=NULLIF(ability.payload->>'TradeSkillCategoryID','')::int
			)
			INSERT INTO catalog_recipes(version_id,spell_id,source_spell_version_id)
			SELECT DISTINCT mapped.recipe_version_id,(mapped.payload->>'Spell')::int,spell_version.id
			FROM mapped
			JOIN game_entities spell ON spell.product_id=$1 AND spell.entity_type='spell'
				AND spell.external_id=(mapped.payload->>'Spell')::bigint
			JOIN game_entity_versions spell_version ON spell_version.id=spell.latest_version_id
				AND spell_version.build_id=$2
			ON CONFLICT(version_id) DO UPDATE SET spell_id=EXCLUDED.spell_id,
				source_spell_version_id=EXCLUDED.source_spell_version_id;
			WITH abilities AS (
				SELECT row.payload,row.source_artifact_id FROM catalog_db2_rows row
				WHERE row.build_id=$2 AND row.table_name='SkillLineAbility' AND row.locale='en_US'
				  AND (COALESCE(NULLIF(row.payload->>'TradeSkillCategoryID','')::int,0)>0 OR (
					NOT EXISTS (SELECT 1 FROM catalog_db2_rows category
						WHERE category.build_id=$2 AND category.table_name='TradeSkillCategory')
					AND EXISTS (SELECT 1 FROM catalog_db2_rows reagents
						WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
						  AND COALESCE(NULLIF(reagents.payload->>'SpellID','')::bigint,0)=(row.payload->>'Spell')::bigint)
				  ))
			), mapped AS (
				SELECT profession_version.version_id AS profession_version_id,recipe.version_id AS recipe_version_id,
					category.id AS category_id,ability.payload,ability.source_artifact_id
				FROM abilities ability
				JOIN projected_profession_versions profession_version ON profession_version.external_id=(ability.payload->>'SkillLine')::bigint
				JOIN projected_recipe_versions recipe ON recipe.external_id=(ability.payload->>'Spell')::bigint
				LEFT JOIN catalog_trade_skill_categories category ON category.build_id=$2 AND category.external_id=NULLIF(ability.payload->>'TradeSkillCategoryID','')::int
			)
			INSERT INTO catalog_profession_recipes(profession_version_id,recipe_version_id,trade_skill_category_id,min_skill_rank,trivial_rank_low,trivial_rank_high,acquire_method,supercedes_spell_id,flags,source_artifact_id)
			SELECT profession_version_id,recipe_version_id,min(category_id),min(COALESCE(NULLIF(payload->>'MinSkillLineRank','')::int,0)),
				min(COALESCE(NULLIF(payload->>'TrivialSkillLineRankLow','')::int,0)),max(COALESCE(NULLIF(payload->>'TrivialSkillLineRankHigh','')::int,0)),
				min(COALESCE(NULLIF(payload->>'AcquireMethod','')::int,0)),max(NULLIF(payload->>'SupercedesSpell','')::int),bit_or(COALESCE(NULLIF(payload->>'Flags','')::bigint,0)),source_artifact_id
			FROM mapped WHERE recipe_version_id IS NOT NULL
			GROUP BY profession_version_id,recipe_version_id,source_artifact_id
			ON CONFLICT(profession_version_id,recipe_version_id) DO UPDATE SET trade_skill_category_id=EXCLUDED.trade_skill_category_id,
				min_skill_rank=EXCLUDED.min_skill_rank,trivial_rank_low=EXCLUDED.trivial_rank_low,trivial_rank_high=EXCLUDED.trivial_rank_high,
				acquire_method=EXCLUDED.acquire_method,supercedes_spell_id=EXCLUDED.supercedes_spell_id,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID)
		if err != nil {
			return fmt.Errorf("project profession recipes: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_recipe_reagents(recipe_version_id,slot,item_entity_id,item_external_id,quantity,recraft_quantity,source_type,source_artifact_id)
			SELECT recipe.version_id,slot.slot,item.id,(reagents.payload->>format('Reagent_%s',slot.slot))::int,
				(reagents.payload->>format('ReagentCount_%s',slot.slot))::int,
				COALESCE(NULLIF(reagents.payload->>format('ReagentReCraftCount_%s',slot.slot),'')::int,0),
				COALESCE(NULLIF(reagents.payload->>format('ReagentSource_%s',slot.slot),'')::int,0),reagents.source_artifact_id
			FROM catalog_db2_rows reagents CROSS JOIN generate_series(0,7) AS slot(slot)
			JOIN projected_recipe_versions recipe ON recipe.external_id=(reagents.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			LEFT JOIN game_entities item ON item.product_id=$1 AND item.entity_type='item'
			  AND item.external_id=(reagents.payload->>format('Reagent_%s',slot.slot))::bigint
			WHERE reagents.build_id=$2 AND reagents.table_name='SpellReagents' AND reagents.locale='en_US'
			  AND COALESCE(NULLIF(reagents.payload->>format('Reagent_%s',slot.slot),'')::int,0)>0
			  AND COALESCE(NULLIF(reagents.payload->>format('ReagentCount_%s',slot.slot),'')::int,0)>0
			ON CONFLICT(recipe_version_id,slot) DO UPDATE SET item_entity_id=EXCLUDED.item_entity_id,item_external_id=EXCLUDED.item_external_id,
				quantity=EXCLUDED.quantity,recraft_quantity=EXCLUDED.recraft_quantity,source_type=EXCLUDED.source_type,
				source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_recipe_currencies(recipe_version_id,currency_external_id,quantity,recraft_quantity,order_index,source_artifact_id)
			SELECT recipe.version_id,(currency.payload->>'CurrencyTypesID')::int,(currency.payload->>'CurrencyCount')::int,
				COALESCE(NULLIF(currency.payload->>'OverrideRecraftCurrencyCount','')::int,0),COALESCE(NULLIF(currency.payload->>'OrderSource','')::int,0),currency.source_artifact_id
			FROM catalog_db2_rows currency
			JOIN projected_recipe_versions recipe ON recipe.external_id=(currency.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			WHERE currency.build_id=$2 AND currency.table_name='SpellReagentsCurrency' AND currency.locale='en_US'
			  AND COALESCE(NULLIF(currency.payload->>'CurrencyTypesID','')::int,0)>0 AND COALESCE(NULLIF(currency.payload->>'CurrencyCount','')::int,0)>0
			ON CONFLICT(recipe_version_id,currency_external_id) DO UPDATE SET quantity=EXCLUDED.quantity,recraft_quantity=EXCLUDED.recraft_quantity,
				order_index=EXCLUDED.order_index,source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_recipe_outputs(recipe_version_id,item_entity_id,item_external_id,source,source_artifact_id)
			SELECT DISTINCT recipe.version_id,item.id,(effect.payload->>'EffectItemType')::int,'spell_effect',effect.source_artifact_id
			FROM catalog_db2_rows effect
			JOIN projected_recipe_versions recipe ON recipe.external_id=(effect.payload->>'SpellID')::bigint
			JOIN catalog_recipes typed_recipe ON typed_recipe.version_id=recipe.version_id
			LEFT JOIN game_entities item ON item.product_id=$1 AND item.entity_type='item' AND item.external_id=(effect.payload->>'EffectItemType')::bigint
			WHERE effect.build_id=$2 AND effect.table_name='SpellEffect' AND effect.locale='en_US'
			  AND COALESCE(NULLIF(effect.payload->>'EffectItemType','')::int,0)>0
			ON CONFLICT(recipe_version_id,item_external_id,source) DO UPDATE SET item_entity_id=EXCLUDED.item_entity_id,
				source_artifact_id=EXCLUDED.source_artifact_id;

			UPDATE catalog_item_acquisition_sources acquisition
			SET source_entity_id=recipe.id
			FROM game_entity_versions item_version,game_entities recipe
			WHERE acquisition.version_id=item_version.id AND item_version.build_id=$2
			  AND acquisition.source_type='crafting_recipe'
			  AND recipe.product_id=$1 AND recipe.entity_type='recipe'
			  AND recipe.external_id=acquisition.source_id AND recipe.deleted_at IS NULL`,
			pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project recipe components: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectPvpTalents(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talent_localizations ON COMMIT DROP AS
			SELECT talent.row_id AS external_id,talent.locale,
				spell.payload->>'Name_lang' AS name,
				COALESCE(talent.payload->>'Description_lang','') AS description,
				talent.payload AS db2,talent.source_url,talent.source_artifact_id
			FROM catalog_db2_rows talent
			JOIN catalog_db2_rows spell ON spell.build_id=talent.build_id
				AND spell.table_name='SpellName' AND spell.locale=talent.locale
				AND spell.row_id=COALESCE(NULLIF(talent.payload->>'SpellID','')::bigint,0)
			WHERE talent.build_id=$1 AND talent.table_name='PvpTalent'
				AND talent.locale IN ('en_US','ru_RU')
				AND NULLIF(BTRIM(spell.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID); err != nil {
			return fmt.Errorf("stage PvP talent localizations: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talents ON COMMIT DROP AS
			SELECT external_id,name,description,db2,source_url,source_artifact_id,
				jsonb_build_object('name',name,'description',description,'kind','pvp','db2',db2,
					'spellId',COALESCE(NULLIF(db2->>'SpellID','')::bigint,0),
					'specId',COALESCE(NULLIF(db2->>'SpecID','')::bigint,0)) AS payload
			FROM projected_pvp_talent_localizations WHERE locale='en_US';
			ALTER TABLE projected_pvp_talents ADD COLUMN content_hash BYTEA;
			UPDATE projected_pvp_talents
			SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_pvp_talents_id_idx ON projected_pvp_talents(external_id)`); err != nil {
			return fmt.Errorf("stage canonical PvP talents: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$2,'pvp_talent',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name,'[^[:alnum:]]+','-','g'))),''),'pvp-talent-'||external_id),
				$3,$3,NULL,now() FROM projected_pvp_talents
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,
				deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert PvP talent entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,projected.content_hash,
				projected.payload,projected.source_url,$3,projected.source_artifact_id
			FROM projected_pvp_talents projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type='pvp_talent' AND entity.external_id=projected.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id
				AND old.build_id=$2 AND old.content_hash=projected.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("insert PvP talent versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_pvp_talent_versions ON COMMIT DROP AS
			SELECT projected.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_pvp_talents projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type='pvp_talent' AND entity.external_id=projected.external_id
			JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
				AND candidate.build_id=$2 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true`,
			ic.ProductID, ic.BuildID, ic.SnapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version.version_id,localized.locale,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'pvp-talent-'||localized.external_id),
				localized.name,localized.description,
				localized.db2||jsonb_build_object('kind','pvp')
			FROM projected_pvp_talent_localizations localized
			JOIN projected_pvp_talent_versions version ON version.external_id=localized.external_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize PvP talents: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity SET latest_version_id=projected.version_id,updated_at=now()
			FROM projected_pvp_talent_versions projected
			WHERE entity.id=projected.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate staged PvP talents: %w", err)
		}
		return nil
	})
	return projected, err
}
