-- +goose Up
-- The first quest usability rule treated every standalone word "test" or
-- "internal" as an editor marker.  Those words also occur in real, localized
-- quest titles (for example "A Test of Courage" and equipment blueprints with
-- an internal stabilizer).  Narrow the baseline to explicit editor markers,
-- then add a small, phrase-based denylist for unmistakable test fixtures.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION catalog_refresh_quest_localization_usability_base(target_build_id BIGINT)
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
               ) AS ru_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=(SELECT id FROM game_products WHERE slug='wow')
          AND entity.entity_type='quest'
          AND entity.deleted_at IS NULL
          AND version.build_id=target_build_id
    ), classified AS (
        SELECT product_id,external_id,version_id,source_artifact_id,
               CASE
                   WHEN lower(COALESCE(en_name,'')) ~
                       '(^|[[:space:]_:[(<>-])(dnt|unused|deprecated|zzold|delete|dummy|nyi)([[:space:]_:)<>-]|$)|[[](ph|dnd|dnt|test|unused|deprecated|internal|rnm|zzold|nyi)[]]|^internal:'
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
        source_artifact_id,evidence,'quest-localization-usability-v1',now()
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

ALTER FUNCTION catalog_refresh_quest_usability(BIGINT)
    RENAME TO catalog_refresh_quest_usability_v6;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_quest_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    baseline_affected BIGINT;
    technical_test_affected BIGINT;
BEGIN
    SELECT catalog_refresh_quest_usability_v6(target_build_id)
    INTO baseline_affected;

    -- These phrases identify test fixtures, not ordinary titles that happen
    -- to describe a test, trial, taste test, test flight, or test drive.
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='technical_or_placeholder_marker',
        evidence=usability.evidence||jsonb_build_object(
            'technical_marker','unambiguous_test_fixture_title',
            'english_name',localization.name,
            'build_id',target_build_id),
        rule_version='quest-localization-usability-v7',
        assessed_at=now()
    FROM game_entities entity
    JOIN game_entity_versions version ON version.id=entity.published_version_id
    JOIN game_entity_localizations localization
      ON localization.version_id=version.id AND localization.locale='en_US'
    WHERE usability.product_id=entity.product_id
      AND usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.external_id=entity.external_id
      AND entity.entity_type='quest' AND entity.deleted_at IS NULL
      AND version.build_id=target_build_id
      AND usability.rule_version NOT LIKE 'midnight-%'
      AND lower(BTRIM(localization.name)) ~
          '^(test|test:.*|test[[:space:]_-]+quest|test bonus objective|bounty quest test( 2)?|bug test|midsummer test|mount up test|nav test:.*|scarab test.*|split blob test.*|ui test:.*|yuni-test|this is a repro test|.*[[:space:]_-]+test[[:space:]_-]+quest|.* test task|.* test currency quest|.* test criteria-based progress bar|test of hyphen tech|ye olde test.*|[0-9. -]+.* - test - [a-z]+)$';
    GET DIAGNOSTICS technical_test_affected=ROW_COUNT;

    RETURN baseline_affected+technical_test_affected;
END;
$$;
-- +goose StatementEnd

-- Rebuild the derived decisions in the same release that changes their rule.
-- Raw quest entities, localizations, and source evidence are not modified.
-- +goose StatementBegin
DO $$
DECLARE build_record RECORD;
BEGIN
    FOR build_record IN
        SELECT DISTINCT version.build_id
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        WHERE entity.product_id=(SELECT id FROM game_products WHERE slug='wow')
          AND entity.entity_type='quest' AND entity.deleted_at IS NULL
    LOOP
        PERFORM catalog_refresh_quest_usability(build_record.build_id);
    END LOOP;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION catalog_refresh_quest_usability(BIGINT);
ALTER FUNCTION catalog_refresh_quest_usability_v6(BIGINT)
    RENAME TO catalog_refresh_quest_usability;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION catalog_refresh_quest_localization_usability_base(target_build_id BIGINT)
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
               ) AS ru_proven
        FROM game_entities entity
        JOIN game_entity_versions version ON version.id=entity.published_version_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=(SELECT id FROM game_products WHERE slug='wow')
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
        source_artifact_id,evidence,'quest-localization-usability-v1',now()
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
          AND entity.entity_type='quest' AND entity.deleted_at IS NULL
    LOOP
        PERFORM catalog_refresh_quest_usability(build_record.build_id);
    END LOOP;
END;
$$;
-- +goose StatementEnd
