-- +goose Up
-- A recipe entity is player-facing only when its normalized output and source
-- proof exist.  Recipe registry rows without outputs remain raw/review data;
-- they must not look like complete crafting instructions.

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_recipe_usability(target_build_id BIGINT)
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
                   SELECT 1 FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='en_US'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS en_proven,
               EXISTS (
                   SELECT 1 FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='ru_RU'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS ru_proven,
               EXISTS (
                   SELECT 1 FROM catalog_recipe_outputs output
                   JOIN catalog_source_artifacts artifact ON artifact.id=output.source_artifact_id
                   WHERE output.recipe_version_id=version.id
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS output_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=(SELECT id FROM game_products WHERE slug='wow')
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
        source_artifact_id,evidence,'recipe-facts-usability-v1',now()
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
DO $$
DECLARE build_record RECORD;
BEGIN
    FOR build_record IN
        SELECT DISTINCT version.build_id
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.product_id=(SELECT id FROM game_products WHERE slug='wow')
          AND entity.entity_type='recipe' AND entity.deleted_at IS NULL
    LOOP
        PERFORM catalog_refresh_recipe_usability(build_record.build_id);
    END LOOP;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS catalog_refresh_recipe_usability(BIGINT);
DELETE FROM catalog_entity_usability WHERE rule_version='recipe-facts-usability-v1';
