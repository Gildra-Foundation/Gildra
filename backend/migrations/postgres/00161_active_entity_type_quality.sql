-- +goose Up
-- Give active-build creature, encounter, and small entity types an explicit
-- public quality policy.  Raw rows remain available for internal audit; rows
-- without the required evidence are held in review instead of silently
-- becoming public because no classifier happened to exist yet.

CREATE TABLE catalog_entity_type_quality_profiles (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    locale_policy TEXT NOT NULL CHECK (locale_policy IN ('bilingual','not_applicable')),
    requires_creature_facts BOOLEAN NOT NULL DEFAULT false,
    rule_version TEXT NOT NULL CHECK (rule_version ~ '^[a-z][a-z0-9_-]{1,63}$'),
    PRIMARY KEY (product_id, entity_type)
);

INSERT INTO catalog_entity_type_quality_profiles(
    product_id,entity_type,locale_policy,requires_creature_facts,rule_version
)
SELECT product.id,profile.entity_type,profile.locale_policy,profile.requires_creature_facts,
       'active-entity-type-quality-v1'
FROM game_products product
CROSS JOIN (VALUES
    ('achievement','bilingual',false),
    ('area','bilingual',false),
    ('battle_pet','bilingual',false),
    ('class','bilingual',false),
    ('creature','bilingual',true),
    ('currency','bilingual',false),
    ('encounter','bilingual',false),
    ('faction','bilingual',false),
    ('instance','bilingual',false),
    ('map','bilingual',false),
    ('mount','bilingual',false),
    ('profession','bilingual',false),
    ('pvp_talent','bilingual',false),
    ('specialization','bilingual',false),
    ('talent','bilingual',false),
    ('talent_tree','bilingual',false),
    ('toy','bilingual',false),
    ('transmog_set','bilingual',false),
    ('ui_map','bilingual',false),
    ('enchantment','not_applicable',false),
    ('food','not_applicable',false),
    ('flask','not_applicable',false),
    ('gem','not_applicable',false),
    ('potion','not_applicable',false),
    ('season','not_applicable',false)
) AS profile(entity_type,locale_policy,requires_creature_facts)
WHERE product.slug='wow'
ON CONFLICT (product_id,entity_type) DO UPDATE SET
    locale_policy=EXCLUDED.locale_policy,
    requires_creature_facts=EXCLUDED.requires_creature_facts,
    rule_version=EXCLUDED.rule_version;

CREATE INDEX catalog_entity_type_quality_profiles_policy_idx
    ON catalog_entity_type_quality_profiles(product_id,locale_policy);

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_active_entity_type_usability(
    target_product_id SMALLINT,
    target_build_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    affected BIGINT;
BEGIN
    WITH selected AS (
        SELECT entity.product_id,entity.entity_type,entity.external_id,
               version.id AS version_id,version.source_artifact_id,
               profile.locale_policy,profile.requires_creature_facts,
               NULLIF(BTRIM(en.name),'') AS en_name,
               NULLIF(BTRIM(ru.name),'') AS ru_name,
               EXISTS (
                   SELECT 1
                   FROM catalog_source_artifacts artifact
                   WHERE artifact.id=version.source_artifact_id
                     AND artifact.status='ready'
                     AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
               ) AS version_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='en_US'
                     AND artifact.status='ready'
                     AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
                     AND (artifact.locale='' OR artifact.locale=proof.locale)
               ) AS en_proven,
               EXISTS (
                   SELECT 1
                   FROM catalog_entity_localization_artifacts proof
                   JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
                   WHERE proof.version_id=version.id AND proof.locale='ru_RU'
                     AND artifact.status='ready'
                     AND artifact.content_hash IS NOT NULL
                     AND artifact.byte_size IS NOT NULL
                     AND (artifact.locale='' OR artifact.locale=proof.locale)
               ) AS ru_proven,
               CASE WHEN profile.requires_creature_facts THEN EXISTS (
                   SELECT 1
                   FROM catalog_creatures creature
                   WHERE creature.version_id=version.id
               ) ELSE true END AS facts_proven,
               CASE WHEN profile.requires_creature_facts THEN EXISTS (
                   SELECT 1
                   FROM catalog_creature_displays display
                   WHERE display.version_id=version.id
               ) ELSE true END AS display_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        JOIN catalog_entity_type_quality_profiles profile
          ON profile.product_id=entity.product_id
         AND profile.entity_type=entity.entity_type
        LEFT JOIN game_entity_localizations en
          ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru
          ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=target_product_id
          AND version.build_id=target_build_id
          AND entity.deleted_at IS NULL
    ), classified AS (
        SELECT selected.*,
               CASE
                   WHEN COALESCE(en_name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
                       THEN 'excluded'
                   WHEN en_name IS NULL OR NOT version_proven OR NOT en_proven
                       THEN 'review'
                   WHEN locale_policy='bilingual' AND (ru_name IS NULL OR NOT ru_proven)
                       THEN 'review'
                   WHEN NOT facts_proven OR NOT display_proven
                       THEN 'review'
                   ELSE 'eligible'
               END AS decision
        FROM selected
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    )
    SELECT product_id,target_build_id,entity_type,external_id,decision,
        CASE decision
            WHEN 'excluded' THEN 'technical_or_placeholder_marker'
            WHEN 'eligible' THEN 'verified_active_entity_type'
            WHEN 'review' THEN CASE
                WHEN en_name IS NULL THEN 'missing_english_name'
                WHEN NOT version_proven THEN 'unproven_entity_version'
                WHEN NOT en_proven THEN 'unproven_english_localization'
                WHEN locale_policy='bilingual' AND ru_name IS NULL THEN 'missing_russian_name'
                WHEN locale_policy='bilingual' AND NOT ru_proven THEN 'unproven_russian_localization'
                WHEN NOT facts_proven THEN 'missing_creature_facts'
                WHEN NOT display_proven THEN 'missing_creature_display'
                ELSE 'incomplete_active_entity_type'
            END
            ELSE 'incomplete_active_entity_type'
        END,
        source_artifact_id,
        jsonb_build_object(
            'entity_type',entity_type,
            'english_name',en_name,
            'russian_name',ru_name,
            'locale_policy',locale_policy,
            'english_proven',en_proven,
            'russian_proven',ru_proven,
            'version_proven',version_proven,
            'creature_facts_proven',facts_proven,
            'creature_display_proven',display_proven,
            'build_id',target_build_id
        ),
        'active-entity-type-quality-v1',now()
    FROM classified
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,
        reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,
        evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,
        assessed_at=EXCLUDED.assessed_at
    WHERE catalog_entity_usability.rule_version NOT LIKE 'midnight-%';

    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;
-- +goose StatementEnd

-- Apply the profile to the active WoW build.  Historical rows remain raw until
-- a matching build-pinned profile is deliberately enabled for them.
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
        PERFORM catalog_refresh_active_entity_type_usability(product_id,build_id);
    END IF;
END;
$$;
-- +goose StatementEnd

SELECT refresh_catalog_public_summary_stats(NULL);

-- +goose Down
DROP FUNCTION IF EXISTS catalog_refresh_active_entity_type_usability(SMALLINT,BIGINT);
DROP INDEX IF EXISTS catalog_entity_type_quality_profiles_policy_idx;
DROP TABLE IF EXISTS catalog_entity_type_quality_profiles;
DELETE FROM catalog_entity_usability
WHERE rule_version='active-entity-type-quality-v1';
