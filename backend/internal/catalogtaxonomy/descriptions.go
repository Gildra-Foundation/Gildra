package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (i *Indexer) RebuildDescriptions(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		carried, err := carryForwardOfficialLocalizations(ctx, tx)
		if err != nil {
			return err
		}
		published, err := carryForwardPublishedLocalizations(ctx, tx)
		if err != nil {
			return err
		}
		if err := deriveTalentTreeLocalizations(ctx, tx); err != nil {
			return err
		}
		if err := carryForwardPublishedAcquisitions(ctx, tx); err != nil {
			return err
		}
		canonical, err := rebuildCanonicalDescriptions(ctx, tx)
		result.Descriptions = carried + published + canonical
		return err
	})
	return result, err
}

// carryForwardPublishedLocalizations copies the published version's proven
// localization text (name and description per locale) onto the current
// version of the same entity when the new build did not deliver it, and
// carries the proof observation along.  A DB2 build only refreshes the
// fields it ships; Battle.net descriptions and Russian names collected for
// the previous build stay valid until a newer import replaces them.  The
// release gate treats a lost name or description as a regression.
// deriveTalentTreeLocalizations names Raidbots talent trees in Russian from
// the DB2 class and specialization names ("Класс — Специализация"); Raidbots
// publishes English only.  The proof is the specialization's DB2 artifact.
func deriveTalentTreeLocalizations(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		WITH trees AS (
			SELECT tree.id AS entity_id,tree.latest_version_id AS version_id,tree.canonical_slug,
				class_text.name AS class_name,spec_text.name AS spec_name,
				spec.latest_version_id AS spec_version_id
			FROM game_entities tree
			JOIN game_entity_versions tree_version ON tree_version.id=tree.latest_version_id
			JOIN game_entities spec ON spec.product_id=tree.product_id AND spec.entity_type='specialization'
				AND spec.external_id=(tree_version.payload #>> '{raidbots,specId}')::bigint AND spec.deleted_at IS NULL
			JOIN game_entity_localizations spec_text ON spec_text.version_id=spec.latest_version_id AND spec_text.locale='ru_RU'
			JOIN game_entities class ON class.product_id=tree.product_id AND class.entity_type='class'
				AND class.external_id=(tree_version.payload #>> '{raidbots,classId}')::bigint AND class.deleted_at IS NULL
			JOIN game_entity_localizations class_text ON class_text.version_id=class.latest_version_id AND class_text.locale='ru_RU'
			WHERE tree.entity_type='talent_tree' AND tree.deleted_at IS NULL
			  AND tree_version.payload #>> '{raidbots,specId}' ~ '^[1-9][0-9]*$'
			  AND tree_version.payload #>> '{raidbots,classId}' ~ '^[1-9][0-9]*$'
			  AND NULLIF(BTRIM(spec_text.name),'') IS NOT NULL AND NULLIF(BTRIM(class_text.name),'') IS NOT NULL
		), inserted AS (
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version_id,'ru_RU',canonical_slug,class_name||' — '||spec_name,'',
				jsonb_build_object('localization_source','db2_class_specialization')
			FROM trees
			ON CONFLICT(version_id,locale) DO UPDATE SET name=EXCLUDED.name,attributes=game_entity_localizations.attributes||EXCLUDED.attributes
			WHERE NULLIF(game_entity_localizations.name,'') IS NULL
			   OR game_entity_localizations.attributes->>'localization_source'='db2_class_specialization'
			RETURNING version_id
		)
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		SELECT DISTINCT trees.version_id,'ru_RU',proof.source_artifact_id
		FROM trees
		JOIN catalog_entity_localization_artifacts proof ON proof.version_id=trees.spec_version_id AND proof.locale='ru_RU'
		JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
		WHERE artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING`)
	if err != nil {
		return fmt.Errorf("derive talent tree localizations: %w", err)
	}
	return nil
}

func carryForwardPublishedLocalizations(ctx context.Context, tx pgx.Tx) (int64, error) {
	command, err := tx.Exec(ctx, `
		WITH candidates AS (
			SELECT entity.id AS entity_id,entity.latest_version_id AS version_id,entity.canonical_slug,
				published.locale,published.name,published.description
			FROM game_entities entity
			JOIN game_entity_versions current_version ON current_version.id=entity.latest_version_id
			JOIN game_entity_versions published_version ON published_version.id=entity.published_version_id
			JOIN game_entity_localizations published ON published.version_id=published_version.id
			WHERE entity.deleted_at IS NULL
			  AND entity.latest_version_id IS DISTINCT FROM entity.published_version_id
			  AND NULLIF(BTRIM(published.name),'') IS NOT NULL
			  AND EXISTS (
				SELECT 1
				FROM catalog_entity_localization_artifacts proof
				JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
				WHERE proof.version_id=published_version.id AND proof.locale=published.locale
				  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)
		)
		INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
		SELECT version_id,locale,canonical_slug,name,COALESCE(description,''),
			jsonb_build_object('published_carry_forward',true)
		FROM candidates
		ON CONFLICT(version_id,locale) DO UPDATE SET
			name=COALESCE(NULLIF(game_entity_localizations.name,''),EXCLUDED.name),
			description=COALESCE(NULLIF(game_entity_localizations.description,''),EXCLUDED.description),
			attributes=game_entity_localizations.attributes||EXCLUDED.attributes
		WHERE NULLIF(game_entity_localizations.name,'') IS NULL
		   OR (NULLIF(game_entity_localizations.description,'') IS NULL AND NULLIF(EXCLUDED.description,'') IS NOT NULL)`)
	if err != nil {
		return 0, fmt.Errorf("carry published localizations to current versions: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		SELECT DISTINCT entity.latest_version_id,proof.locale,proof.source_artifact_id
		FROM game_entities entity
		JOIN game_entity_localizations current_text ON current_text.version_id=entity.latest_version_id
			AND current_text.attributes ? 'published_carry_forward'
		JOIN catalog_entity_localization_artifacts proof ON proof.version_id=entity.published_version_id
			AND proof.locale=current_text.locale
		JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
		WHERE entity.deleted_at IS NULL
		  AND entity.latest_version_id IS DISTINCT FROM entity.published_version_id
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING`); err != nil {
		return 0, fmt.Errorf("carry published localization proof to current versions: %w", err)
	}
	return command.RowsAffected(), nil
}

// carryForwardPublishedAcquisitions keeps an item's proven acquisition
// sources when the new build's import did not deliver any for it; the rows
// cite the same source artifact as the published version.
func carryForwardPublishedAcquisitions(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO catalog_item_acquisition_sources(
			version_id,source_type,source_id,context_id,source_entity_id,journal_instance_id,
			difficulty_mask,attributes,chance_percent,source_url,chance_source,source_artifact_id)
		SELECT entity.latest_version_id,source.source_type,source.source_id,source.context_id,source.source_entity_id,
			source.journal_instance_id,source.difficulty_mask,
			source.attributes||jsonb_build_object('published_carry_forward',true),
			source.chance_percent,source.source_url,source.chance_source,source.source_artifact_id
		FROM game_entities entity
		JOIN catalog_item_acquisition_sources source ON source.version_id=entity.published_version_id
		JOIN catalog_source_artifacts artifact ON artifact.id=source.source_artifact_id
		WHERE entity.entity_type='item' AND entity.deleted_at IS NULL
		  AND entity.latest_version_id IS DISTINCT FROM entity.published_version_id
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND NOT EXISTS (
			SELECT 1 FROM catalog_item_acquisition_sources current_source
			WHERE current_source.version_id=entity.latest_version_id)
		ON CONFLICT(version_id,source_type,source_id,context_id) DO NOTHING`)
	if err != nil {
		return fmt.Errorf("carry published acquisition sources to current versions: %w", err)
	}
	return nil
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
				document.source_url,document.source_artifact_id
			FROM catalog_entity_source_documents document
			JOIN game_builds source_build ON source_build.id=document.build_id
			JOIN game_entities target ON target.entity_type=document.entity_type
				AND target.external_id=document.external_id AND target.deleted_at IS NULL
			JOIN game_entity_versions target_version ON target_version.id=target.latest_version_id
			JOIN game_entity_localizations localized ON localized.version_id=target_version.id
				AND localized.locale=document.locale
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
	// Carry the proof along with the text.  A new DB2 version can reuse an
	// older, still-valid Blizzard localization; without this observation the
	// text is useful but the release gate quite correctly treats it as
	// unproven.
	_, err = tx.Exec(ctx, `
		WITH source_documents AS (
			SELECT DISTINCT ON (target_version.id,document.locale)
				target_version.id AS version_id,document.locale,document.source_artifact_id
			FROM catalog_entity_source_documents document
			JOIN catalog_source_artifacts artifact ON artifact.id=document.source_artifact_id
			JOIN game_builds source_build ON source_build.id=document.build_id
			JOIN game_entities target ON target.entity_type=document.entity_type
				AND target.external_id=document.external_id AND target.deleted_at IS NULL
			JOIN game_entity_versions target_version ON target_version.id=target.latest_version_id
			JOIN game_entity_localizations localized ON localized.version_id=target_version.id
				AND localized.locale=document.locale
			JOIN game_builds target_build ON target_build.id=target_version.build_id
			WHERE document.source='blizzard_api' AND document.locale IN ('en_US','ru_RU')
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
			  AND source_build.product_id=target.product_id
			  AND source_build.build_number<=target_build.build_number
			ORDER BY target_version.id,document.locale,source_build.build_number DESC,document.imported_at DESC
		)
		INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
		SELECT version_id,locale,source_artifact_id FROM source_documents
		ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING`)
	if err != nil {
		return 0, fmt.Errorf("carry official localization proof to active build: %w", err)
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
