-- +goose Up
-- Keep the existing Retail quest classifier as the baseline, then allow a
-- deterministic source gap to become excluded only after two independently
-- completed bilingual sweeps.  The raw entity, version, and source records
-- remain immutable audit data; only the build-pinned usability decision is
-- projected.

ALTER FUNCTION catalog_refresh_quest_usability(BIGINT)
    RENAME TO catalog_refresh_quest_localization_usability_base;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_quest_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    baseline_affected BIGINT;
    mismatch_affected BIGINT;
    confirmed_affected BIGINT;
BEGIN
    SELECT catalog_refresh_quest_localization_usability_base(target_build_id)
    INTO baseline_affected;

    -- A complete unavailable observation is accepted only from an immutable,
    -- ready artifact in a finished snapshot.  Both source build fields are
    -- checked: source_build_number is the Blizzard client build number, not
    -- the database surrogate game_builds.id.
    WITH target_build AS (
        SELECT id,product_id,build_number,version
        FROM game_builds
        WHERE id=target_build_id
          AND product_id=(SELECT id FROM game_products WHERE slug='wow')
    ), unavailable AS (
        SELECT record.record_key,artifact.id AS artifact_id,
               artifact.locale,artifact.metadata,
               snapshot.id AS snapshot_id,snapshot.created_at,
               target.build_number,target.version,
               (artifact.metadata->>'source_build_number'=target.build_number::text
                AND artifact.metadata->>'source_build_version'=target.version) AS source_build_matches
        FROM catalog_source_records record
        JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
        JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
        JOIN target_build target ON target.id=artifact.build_id
        WHERE artifact.source='blizzard_api'
          AND artifact.artifact_key IN ('battlenet/quest','battlenet-missing/quest')
          AND artifact.locale IN ('en_US','ru_RU')
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
          AND snapshot.status IN ('validated','published')
          AND record.record_key LIKE 'unavailable/%'
          AND record.payload->>'entity_type'='quest'
          AND record.payload->>'external_id'=split_part(record.record_key,'/',2)
          AND record.payload->>'locale'=artifact.locale
          AND record.payload->>'status'='unavailable'
          AND record.payload->>'http_status'='404'
          AND record.payload->>'reason'='detail_not_found'
    ), complete_sweeps AS (
        SELECT record_key,snapshot_id,max(created_at) AS sweep_at,
               bool_or(locale='en_US') AS has_en,
               bool_or(locale='ru_RU') AS has_ru,
               bool_and(source_build_matches) AS source_build_matches,
               (array_agg(artifact_id ORDER BY created_at DESC,locale DESC))[1] AS latest_artifact_id,
               (array_agg(metadata ORDER BY created_at DESC,locale DESC))[1] AS latest_metadata
        FROM unavailable
        GROUP BY record_key,snapshot_id
        HAVING bool_or(locale='en_US') AND bool_or(locale='ru_RU')
    ), ranked_sweeps AS (
        SELECT complete_sweeps.*,
               row_number() OVER (
                   PARTITION BY record_key ORDER BY sweep_at DESC,snapshot_id DESC
               ) AS sweep_rank
        FROM complete_sweeps
    ), mismatch_ids AS (
        SELECT DISTINCT ON (record_key)
               record_key,latest_artifact_id AS artifact_id,
               latest_metadata->>'source_build_number' AS source_build_number,
               latest_metadata->>'source_build_version' AS source_build_version
        FROM ranked_sweeps
        WHERE sweep_rank<=2 AND NOT source_build_matches
        ORDER BY record_key,sweep_rank
    )
    UPDATE catalog_entity_usability usability
    SET decision='review',
        reason_code='official_not_found_build_mismatch',
        source_artifact_id=mismatch.artifact_id,
        evidence=usability.evidence || jsonb_build_object(
            'official_not_found','build_mismatch',
            'source_build_number',mismatch.source_build_number,
            'source_build_version',mismatch.source_build_version,
            'target_build_id',target_build_id,
            'source_record_key',mismatch.record_key),
        rule_version='quest-localization-usability-v2',
        assessed_at=now()
    FROM mismatch_ids mismatch
    WHERE usability.product_id=(SELECT product_id FROM game_builds WHERE id=target_build_id)
      AND usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND mismatch.record_key='unavailable/'||usability.external_id::text
      AND usability.decision='review'
      AND NOT EXISTS (
          SELECT 1
          FROM game_entities entity
          JOIN game_entity_versions version ON version.id=entity.published_version_id
          JOIN game_entity_localizations localization
            ON localization.version_id=version.id AND localization.locale='en_US'
          WHERE entity.product_id=usability.product_id
            AND entity.entity_type='quest'
            AND entity.external_id=usability.external_id
            AND version.build_id=target_build_id
            AND COALESCE(localization.name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]'
      );
    GET DIAGNOSTICS mismatch_affected=ROW_COUNT;

    WITH target_build AS (
        SELECT id,product_id,build_number,version
        FROM game_builds
        WHERE id=target_build_id
          AND product_id=(SELECT id FROM game_products WHERE slug='wow')
    ), quests AS (
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
        JOIN target_build target ON target.id=version.build_id
        LEFT JOIN game_entity_localizations en ON en.version_id=version.id AND en.locale='en_US'
        LEFT JOIN game_entity_localizations ru ON ru.version_id=version.id AND ru.locale='ru_RU'
        WHERE entity.product_id=target.product_id
          AND entity.entity_type='quest'
          AND entity.deleted_at IS NULL
    ), unavailable AS (
        SELECT record.record_key,artifact.id AS artifact_id,
               artifact.locale,artifact.metadata,
               snapshot.id AS snapshot_id,snapshot.created_at,
               target.build_number,target.version,
               (artifact.metadata->>'source_build_number'=target.build_number::text
                AND artifact.metadata->>'source_build_version'=target.version) AS source_build_matches
        FROM catalog_source_records record
        JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
        JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
        JOIN target_build target ON target.id=artifact.build_id
        WHERE artifact.source='blizzard_api'
          AND artifact.artifact_key IN ('battlenet/quest','battlenet-missing/quest')
          AND artifact.locale IN ('en_US','ru_RU')
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
          AND snapshot.status IN ('validated','published')
          AND record.record_key LIKE 'unavailable/%'
          AND record.payload->>'entity_type'='quest'
          AND record.payload->>'external_id'=split_part(record.record_key,'/',2)
          AND record.payload->>'locale'=artifact.locale
          AND record.payload->>'status'='unavailable'
          AND record.payload->>'http_status'='404'
          AND record.payload->>'reason'='detail_not_found'
    ), complete_sweeps AS (
        SELECT record_key,snapshot_id,max(created_at) AS sweep_at,
               bool_or(locale='en_US') AS has_en,
               bool_or(locale='ru_RU') AS has_ru,
               bool_and(source_build_matches) AS source_build_matches,
               (array_agg(artifact_id ORDER BY created_at DESC,locale DESC))[1] AS latest_artifact_id
        FROM unavailable
        GROUP BY record_key,snapshot_id
        HAVING bool_or(locale='en_US') AND bool_or(locale='ru_RU')
    ), ranked_sweeps AS (
        SELECT complete_sweeps.*,
               row_number() OVER (
                   PARTITION BY record_key ORDER BY sweep_at DESC,snapshot_id DESC
               ) AS sweep_rank
        FROM complete_sweeps
    ), confirmed AS (
        SELECT record_key,count(*) AS sweep_count,min(sweep_at) AS first_sweep_at,
               max(sweep_at) AS last_sweep_at,
               (array_agg(latest_artifact_id ORDER BY sweep_at DESC))[1] AS latest_artifact_id
        FROM ranked_sweeps
        WHERE sweep_rank<=2
        GROUP BY record_key
        HAVING count(*)=2
           AND bool_and(source_build_matches)
           AND max(sweep_at)-min(sweep_at) >= interval '24 hours'
    ), mismatched AS (
        SELECT DISTINCT record_key
        FROM ranked_sweeps
        WHERE sweep_rank<=2 AND NOT source_build_matches
    ), official_success AS (
        SELECT document.build_id,document.entity_type,document.external_id
        FROM catalog_entity_source_documents document
        JOIN catalog_source_artifacts artifact ON artifact.id=document.source_artifact_id
        WHERE document.source='blizzard_api'
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
          AND (artifact.locale='' OR artifact.locale=document.locale)
        UNION
        SELECT version.build_id,'quest',entity.external_id
        FROM catalog_entity_localization_artifacts observation
        JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
        JOIN game_entity_versions version ON version.id=observation.version_id
        JOIN game_entities entity ON entity.id=version.entity_id
        WHERE artifact.source='blizzard_api'
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
          AND (artifact.locale='' OR artifact.locale=observation.locale)
          AND entity.entity_type='quest'
    ), candidates AS (
        SELECT quest.*,confirmed.sweep_count,confirmed.first_sweep_at,confirmed.last_sweep_at,
               confirmed.latest_artifact_id,
               (COALESCE(quest.en_name,'') ~* '(^|[[:space:]_:-])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|[[](ph|dnt|test|unused|deprecated|internal|zzold|nyi)[]]') AS technical_marker,
               EXISTS (
                   SELECT 1 FROM official_success success
                   WHERE success.build_id=target_build_id
                     AND success.entity_type='quest'
                     AND success.external_id=quest.external_id
               ) AS official_success,
               EXISTS (
                   SELECT 1 FROM mismatched mismatch
                   WHERE mismatch.record_key='unavailable/'||quest.external_id::text
               ) AS has_build_mismatch
        FROM quests quest
        JOIN confirmed ON confirmed.record_key='unavailable/'||quest.external_id::text
    )
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='official_not_found_confirmed',
        source_artifact_id=candidate.latest_artifact_id,
        evidence=jsonb_build_object(
            'entity_type','quest',
            'external_id',candidate.external_id,
            'official_not_found','confirmed',
            'http_status',404,
            'locales',jsonb_build_array('en_US','ru_RU'),
            'complete_sweep_count',candidate.sweep_count,
            'first_sweep_at',candidate.first_sweep_at,
            'last_sweep_at',candidate.last_sweep_at,
            'minimum_sweep_spacing','24 hours',
            'source_build_number',(SELECT build_number FROM target_build),
            'source_build_version',(SELECT version FROM target_build),
            'transient',false,
            'english_name',candidate.en_name,
            'russian_name',candidate.ru_name,
            'english_proven',candidate.en_proven,
            'russian_proven',candidate.ru_proven,
            'registry_only',COALESCE(candidate.payload->>'registry_only','false')='true',
            'build_id',target_build_id),
        rule_version='quest-localization-usability-v2',
        assessed_at=now()
    FROM candidates candidate
    WHERE usability.product_id=candidate.product_id
      AND usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.external_id=candidate.external_id
      AND usability.decision='review'
      -- Technical markers and already usable bilingual records retain the
      -- baseline classifier's priority over source-gap evidence.
      AND NOT candidate.technical_marker
      AND NOT (candidate.en_name IS NOT NULL AND candidate.ru_name IS NOT NULL
               AND candidate.en_proven AND candidate.ru_proven)
      AND NOT candidate.official_success
      AND NOT candidate.has_build_mismatch;
    GET DIAGNOSTICS confirmed_affected=ROW_COUNT;
    RETURN baseline_affected+mismatch_affected+confirmed_affected;
END;
$$;
-- +goose StatementEnd

-- Reassess already published Retail quest builds once so the new evidence
-- policy is visible without waiting for the next pipeline publication.
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
DROP FUNCTION IF EXISTS catalog_refresh_quest_usability(BIGINT);
ALTER FUNCTION catalog_refresh_quest_localization_usability_base(BIGINT)
    RENAME TO catalog_refresh_quest_usability;

-- Restore the pre-confirmation classifier's decisions on rollback; the raw
-- source records and entities are intentionally left untouched.
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
