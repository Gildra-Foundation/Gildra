-- +goose Up
-- Hold spell records that are directly used by player-facing Midnight item,
-- recipe, or talent projections until their names and localization proofs are
-- complete.  Raw spell rows remain available to the internal audit.

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_spell_dependency_usability(
    target_product_id SMALLINT,
    target_build_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH referenced AS (
        SELECT DISTINCT item_effect.spell_id AS external_id
        FROM catalog_item_effects item_effect
        JOIN game_entity_versions item_version ON item_version.id=item_effect.version_id
        JOIN game_entities item ON item.id=item_version.entity_id
        JOIN catalog_entity_expansions cohort
          ON cohort.product_id=item.product_id
         AND cohort.build_id=target_build_id
         AND cohort.entity_type='item'
         AND cohort.external_id=item.external_id
         AND cohort.classification='confirmed'
        JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
         AND expansion.expansion_key='midnight'
        JOIN catalog_entity_usability usability
          ON usability.product_id=item.product_id
         AND usability.build_id=target_build_id
         AND usability.entity_type='item'
         AND usability.external_id=item.external_id
         AND usability.decision='eligible'
        WHERE item.product_id=target_product_id
          AND item_version.build_id=target_build_id
        UNION
        SELECT DISTINCT variant_effect.spell_external_id
        FROM catalog_item_variant_effects variant_effect
        JOIN catalog_item_variants variant ON variant.id=variant_effect.variant_id
        JOIN game_entity_versions item_version ON item_version.id=variant.item_version_id
        JOIN game_entities item ON item.id=item_version.entity_id
        JOIN catalog_entity_expansions cohort
          ON cohort.product_id=item.product_id
         AND cohort.build_id=target_build_id
         AND cohort.entity_type='item'
         AND cohort.external_id=item.external_id
         AND cohort.classification='confirmed'
        JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
         AND expansion.expansion_key='midnight'
        JOIN catalog_entity_usability usability
          ON usability.product_id=item.product_id
         AND usability.build_id=target_build_id
         AND usability.entity_type='item'
         AND usability.external_id=item.external_id
         AND usability.decision='eligible'
        WHERE item.product_id=target_product_id
          AND item_version.build_id=target_build_id
          AND variant_effect.spell_external_id IS NOT NULL
        UNION
        SELECT DISTINCT spell_entity.external_id
        FROM catalog_talent_spell_relations relation
        JOIN game_entity_versions talent_version ON talent_version.id=relation.talent_version_id
        JOIN game_entity_versions spell_version ON spell_version.id=relation.spell_version_id
        JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id
        WHERE talent_version.build_id=target_build_id
          AND spell_version.build_id=target_build_id
          AND spell_entity.product_id=target_product_id
          AND spell_entity.entity_type='spell'
        UNION
        SELECT DISTINCT recipe.spell_id::BIGINT
        FROM catalog_recipes recipe
        JOIN game_entity_versions recipe_version ON recipe_version.id=recipe.version_id
        JOIN game_entities recipe_entity ON recipe_entity.id=recipe_version.entity_id
        WHERE recipe_version.build_id=target_build_id
          AND recipe_entity.product_id=target_product_id
          AND recipe.spell_id > 0
    ), spells AS (
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
                     AND (artifact.locale='' OR artifact.locale=proof.locale)
               ) AS en_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='ru_RU'
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
                     AND (artifact.locale='' OR artifact.locale=proof.locale)
               ) AS ru_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_source_artifacts artifact
                   WHERE artifact.id=version.source_artifact_id
                     AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS version_proven,
               (COALESCE(en.description,'') ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'
                OR COALESCE(ru.description,'') ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])') AS unresolved_description
        FROM referenced reference
        JOIN game_entities entity
          ON entity.product_id=target_product_id
         AND entity.entity_type='spell'
         AND entity.external_id=reference.external_id
         AND entity.deleted_at IS NULL
        JOIN game_entity_versions version
          ON version.id=entity.published_version_id
         AND version.build_id=target_build_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
    ), classified AS (
        SELECT product_id,external_id,version_id,source_artifact_id,
               CASE
                   WHEN COALESCE(en_name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
                     THEN 'excluded'
                   WHEN en_name IS NOT NULL AND ru_name IS NOT NULL
                    AND en_proven AND ru_proven AND version_proven
                    AND NOT unresolved_description
                     THEN 'eligible'
                   ELSE 'review'
               END AS decision,
               jsonb_build_object(
                   'entity_type','spell',
                   'english_name',en_name,
                   'russian_name',ru_name,
                   'english_proven',en_proven,
                   'russian_proven',ru_proven,
                   'version_proven',version_proven,
                   'unresolved_description',unresolved_description,
                   'build_id',target_build_id
               ) AS evidence
        FROM spells
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at)
    SELECT product_id,target_build_id,'spell',external_id,decision,
        CASE decision
            WHEN 'excluded' THEN 'technical_or_placeholder_marker'
            WHEN 'eligible' THEN 'verified_spell_dependency'
            ELSE CASE
                WHEN NULLIF(BTRIM(evidence->>'english_name'),'') IS NULL THEN 'missing_english_name'
                WHEN NULLIF(BTRIM(evidence->>'russian_name'),'') IS NULL THEN 'missing_russian_name'
                WHEN (evidence->>'unresolved_description')::boolean THEN 'unresolved_description_template'
                WHEN NOT (evidence->>'version_proven')::boolean THEN 'unproven_entity_version'
                WHEN NOT (evidence->>'english_proven')::boolean
                  OR NOT (evidence->>'russian_proven')::boolean THEN 'unproven_localization'
                ELSE 'incomplete_spell_dependency'
            END
        END,
        source_artifact_id,evidence,'spell-dependency-usability-v1',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,assessed_at=now()
    WHERE catalog_entity_usability.rule_version='spell-dependency-usability-v1';

    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- Apply to the active Retail build only. Historical spell rows remain raw until
-- their own build-pinned dependency cohort is assessed.
-- +goose StatementBegin
DO $$
DECLARE product_id SMALLINT; build_id BIGINT;
BEGIN
    SELECT product.id,build.id INTO product_id,build_id
    FROM game_products product
    JOIN game_builds build ON build.product_id=product.id
    WHERE product.slug='wow' AND build.is_active
    ORDER BY build.build_number DESC LIMIT 1;
    IF product_id IS NOT NULL AND build_id IS NOT NULL THEN
        PERFORM catalog_refresh_spell_dependency_usability(product_id,build_id);
    END IF;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS catalog_refresh_spell_dependency_usability(SMALLINT,BIGINT);
DELETE FROM catalog_entity_usability WHERE rule_version='spell-dependency-usability-v1';
