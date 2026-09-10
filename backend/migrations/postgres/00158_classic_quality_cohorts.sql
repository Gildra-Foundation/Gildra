-- +goose Up
-- Extend the build-pinned quality model to the Classic product family.  The
-- raw registry remains intact, but Classic quest rows without proven EN/RU
-- localization and recipes without a proven output are held for review.

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_classic_quest_usability(
    target_product_id SMALLINT,
    target_build_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH quests AS (
        SELECT entity.product_id,entity.external_id,version.id AS version_id,
               version.source_artifact_id,version.payload,
               NULLIF(BTRIM(en.name),'') AS en_name,
               NULLIF(BTRIM(ru.name),'') AS ru_name,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='en_US'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS en_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='ru_RU'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS ru_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=target_product_id
          AND entity.entity_type='quest'
          AND entity.deleted_at IS NULL
          AND version.build_id=target_build_id
    ), classified AS (
        SELECT product_id,external_id,version_id,source_artifact_id,
               CASE
                   WHEN COALESCE(en_name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
                     THEN 'excluded'
                   WHEN en_name IS NOT NULL AND ru_name IS NOT NULL AND en_proven AND ru_proven
                     THEN 'eligible'
                   ELSE 'review'
               END AS decision,
               jsonb_build_object(
                   'entity_type','quest',
                   'english_name',en_name,
                   'russian_name',ru_name,
                   'english_proven',en_proven,
                   'russian_proven',ru_proven,
                   'registry_only',COALESCE(payload->>'registry_only','false')='true',
                   'build_id',target_build_id
               ) AS evidence
        FROM quests
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at)
    SELECT product_id,target_build_id,'quest',external_id,decision,
        CASE decision
            WHEN 'excluded' THEN 'technical_or_placeholder_marker'
            WHEN 'eligible' THEN 'verified_bilingual_localization'
            ELSE CASE
                WHEN NULLIF(BTRIM(evidence->>'english_name'),'') IS NULL THEN 'missing_english_name'
                WHEN NULLIF(BTRIM(evidence->>'russian_name'),'') IS NULL THEN 'missing_russian_name'
                WHEN NOT (evidence->>'english_proven')::boolean
                  OR NOT (evidence->>'russian_proven')::boolean THEN 'unproven_localization'
                ELSE 'registry_only_or_incomplete'
            END
        END,
        source_artifact_id,evidence,'classic-quest-localization-usability-v1',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=now()
    WHERE catalog_entity_usability.rule_version NOT LIKE 'midnight-%';

    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_classic_recipe_usability(
    target_product_id SMALLINT,
    target_build_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH recipes AS (
        SELECT entity.product_id,entity.external_id,version.id AS version_id,
               version.source_artifact_id,
               NULLIF(BTRIM(en.name),'') AS en_name,
               NULLIF(BTRIM(ru.name),'') AS ru_name,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='en_US'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS en_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='ru_RU'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS ru_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_recipe_outputs output
                   JOIN catalog_source_artifacts artifact ON artifact.id=output.source_artifact_id
                   WHERE output.recipe_version_id=version.id
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS output_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=target_product_id
          AND entity.entity_type='recipe'
          AND entity.deleted_at IS NULL
          AND version.build_id=target_build_id
    ), classified AS (
        SELECT product_id,external_id,version_id,source_artifact_id,
               CASE
                   WHEN COALESCE(en_name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
                     THEN 'excluded'
                   WHEN en_name IS NOT NULL AND ru_name IS NOT NULL AND en_proven AND ru_proven AND output_proven
                     THEN 'eligible'
                   ELSE 'review'
               END AS decision,
               jsonb_build_object(
                   'entity_type','recipe',
                   'english_name',en_name,
                   'russian_name',ru_name,
                   'english_proven',en_proven,
                   'russian_proven',ru_proven,
                   'output_proven',output_proven,
                   'build_id',target_build_id
               ) AS evidence
        FROM recipes
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at)
    SELECT product_id,target_build_id,'recipe',external_id,decision,
        CASE decision
            WHEN 'excluded' THEN 'technical_or_placeholder_marker'
            WHEN 'eligible' THEN 'verified_recipe_output'
            ELSE CASE
                WHEN NULLIF(BTRIM(evidence->>'english_name'),'') IS NULL THEN 'missing_english_name'
                WHEN NULLIF(BTRIM(evidence->>'russian_name'),'') IS NULL THEN 'missing_russian_name'
                WHEN NOT (evidence->>'output_proven')::boolean THEN 'missing_recipe_output'
                WHEN NOT (evidence->>'english_proven')::boolean
                  OR NOT (evidence->>'russian_proven')::boolean THEN 'unproven_localization'
                ELSE 'incomplete_recipe_facts'
            END
        END,
        source_artifact_id,evidence,'classic-recipe-facts-usability-v1',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=now()
    WHERE catalog_entity_usability.rule_version NOT LIKE 'midnight-%';

    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- Only Classic products are added here.  Retail WoW remains governed by the
-- existing v1 rules, and Midnight overrides continue to win on conflict.
-- +goose StatementBegin
DO $$
DECLARE
    product_record RECORD;
    build_record RECORD;
BEGIN
    FOR product_record IN
        SELECT id FROM game_products WHERE slug IN ('wow_classic','wow_classic_era','wow_classic_hardcore')
    LOOP
        FOR build_record IN
            SELECT DISTINCT version.build_id
            FROM game_entities entity
            JOIN game_entity_versions version ON version.id=entity.published_version_id
            WHERE entity.product_id=product_record.id
              AND entity.entity_type IN ('quest','recipe')
              AND entity.deleted_at IS NULL
        LOOP
            PERFORM catalog_refresh_classic_quest_usability(product_record.id,build_record.build_id);
            PERFORM catalog_refresh_classic_recipe_usability(product_record.id,build_record.build_id);
        END LOOP;
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- Keep the cached public denominator consistent with the same decision table
-- used by API reads.  A missing row means that this product/type has not yet
-- opted into a quality cohort and therefore retains its historical behavior.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_public_summary_stats(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM catalog_public_summary_stats
    WHERE selected_product_id IS NULL OR product_id=selected_product_id;

    INSERT INTO catalog_public_summary_stats(product_id,locale,entity_type,entity_count,refreshed_at)
    SELECT entity.product_id, locale.locale, entity.entity_type, count(*), now()
    FROM game_entities entity
    CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) locale(locale)
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    LEFT JOIN game_entity_localizations localized
        ON localized.version_id=version.id AND localized.locale=locale.locale
    LEFT JOIN game_entity_localizations fallback
        ON fallback.version_id=version.id AND fallback.locale='en_US'
    WHERE entity.deleted_at IS NULL
      AND COALESCE(NULLIF(localized.name,''),fallback.name,'') <> ''
      AND NOT EXISTS (
          SELECT 1 FROM catalog_entity_usability usability
          WHERE usability.product_id=entity.product_id AND usability.build_id=version.build_id
            AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
            AND usability.decision<>'eligible'
      )
      AND (selected_product_id IS NULL OR entity.product_id=selected_product_id)
    GROUP BY entity.product_id,locale.locale,entity.entity_type;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_public_summary_stats(NULL);

-- The library projection predates the cross-product quality gate.  Wrap the
-- existing refresh so datasets backed by a quality cohort cannot advertise
-- held rows after a scheduled refresh.  The base function still owns all
-- category and item-class projections; this correction targets the simple
-- entity-type datasets (quests/recipes) that Classic uses.
-- +goose StatementBegin
ALTER FUNCTION refresh_catalog_library_datasets(SMALLINT)
    RENAME TO refresh_catalog_library_datasets_v158_base;

CREATE FUNCTION refresh_catalog_library_datasets(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_catalog_library_datasets_v158_base(selected_product_id);

    WITH locales(locale) AS (VALUES ('en_US'::text),('ru_RU'::text)),
    targets AS (
        SELECT definition.slug AS dataset_slug, product.id AS product_id, locale.locale,
               max(version.build_id) AS build_id,
               count(entity.id) AS entity_count,
               count(entity.id) FILTER (WHERE localized.version_id IS NOT NULL) AS localized_count,
               count(entity.id) FILTER (WHERE localized.version_id IS NOT NULL AND EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts observation
                   JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
                   WHERE observation.version_id=version.id AND observation.locale=locale.locale
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
                     AND (artifact.locale='' OR artifact.locale=observation.locale)
               )) AS verified_localized_count,
               count(entity.id) FILTER (WHERE EXISTS (
                   SELECT 1 FROM catalog_entity_tooltips tooltip
                   WHERE tooltip.version_id=version.id AND tooltip.locale=locale.locale
               )) AS tooltip_count,
               count(entity.id) FILTER (WHERE
                   EXISTS (
                       SELECT 1 FROM catalog_entity_icons icon
                       JOIN catalog_source_artifacts artifact ON artifact.id=icon.source_artifact_id
                       WHERE icon.build_id=version.build_id AND icon.entity_type=entity.entity_type
                         AND icon.external_id=entity.external_id
                         AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                         AND artifact.byte_size IS NOT NULL
                   ) OR EXISTS (
                       SELECT 1 FROM catalog_entity_media media
                       JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
                       WHERE media.entity_id=entity.id AND media.build_id=version.build_id
                         AND media.cache_status IN ('remote','cached')
                         AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                         AND artifact.byte_size IS NOT NULL
                   )
               ) AS image_count,
               min(icon.icon_name) FILTER (WHERE icon.icon_name IS NOT NULL) AS preview_icon_name
        FROM catalog_library_dataset_definitions definition
        JOIN game_products product ON product.id IN (
            SELECT DISTINCT usability.product_id
            FROM catalog_entity_usability usability
            WHERE usability.entity_type=definition.entity_type
        )
        CROSS JOIN locales locale
        LEFT JOIN game_entities entity
          ON entity.product_id=product.id AND entity.entity_type=definition.entity_type
         AND entity.deleted_at IS NULL AND entity.published_version_id IS NOT NULL
        LEFT JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN catalog_entity_usability usability
          ON usability.product_id=entity.product_id AND usability.build_id=version.build_id
         AND usability.entity_type=entity.entity_type AND usability.external_id=entity.external_id
        LEFT JOIN game_entity_localizations localized
          ON localized.version_id=version.id AND localized.locale=locale.locale
        LEFT JOIN catalog_entity_icons icon
          ON icon.build_id=version.build_id AND icon.entity_type=entity.entity_type
         AND icon.external_id=entity.external_id
        WHERE definition.is_public AND definition.category_path='' AND definition.item_class_id IS NULL
          AND definition.entity_type IN ('quest','recipe')
          AND (selected_product_id IS NULL OR product.id=selected_product_id)
          AND (usability.decision IS NULL OR usability.decision='eligible')
        GROUP BY definition.slug,product.id,locale.locale
    )
    UPDATE catalog_library_dataset_stats stats
    SET build_id=targets.build_id,
        entity_count=targets.entity_count,
        localized_count=targets.localized_count,
        verified_localized_count=targets.verified_localized_count,
        tooltip_count=targets.tooltip_count,
        image_count=targets.image_count,
        preview_icon_name=targets.preview_icon_name,
        refreshed_at=now()
    FROM targets
    WHERE stats.dataset_slug=targets.dataset_slug
      AND stats.product_id=targets.product_id
      AND stats.locale=targets.locale;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS refresh_catalog_library_datasets(SMALLINT);
ALTER FUNCTION refresh_catalog_library_datasets_v158_base(SMALLINT)
    RENAME TO refresh_catalog_library_datasets;
DROP FUNCTION IF EXISTS catalog_refresh_classic_recipe_usability(SMALLINT,BIGINT);
DROP FUNCTION IF EXISTS catalog_refresh_classic_quest_usability(SMALLINT,BIGINT);
DELETE FROM catalog_entity_usability
WHERE rule_version IN ('classic-quest-localization-usability-v1','classic-recipe-facts-usability-v1');
