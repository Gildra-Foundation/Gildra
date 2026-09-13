-- +goose Up
-- Blizzard's static API can trail the newest client build.  Preserve the
-- strict build-match rule, but allow two bilingual 404 sweeps from the same
-- older API build to exclude a quest when complete QuestV2 artifacts prove
-- that the quest's registry row did not change between the API and target
-- builds.  A row added, removed, or changed in the target build remains in
-- review, as does any comparison without complete immutable DB2 evidence.
ALTER FUNCTION catalog_refresh_quest_usability(BIGINT)
    RENAME TO catalog_refresh_quest_usability_v2;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_quest_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    baseline_affected BIGINT;
    stable_mismatch_affected BIGINT;
BEGIN
    SELECT catalog_refresh_quest_usability_v2(target_build_id)
    INTO baseline_affected;

    WITH target_build AS (
        SELECT id,product_id,build_number,version
        FROM game_builds
        WHERE id=target_build_id
          AND product_id=(SELECT id FROM game_products WHERE slug='wow')
    ), unavailable AS (
        SELECT record.record_key,artifact.id AS artifact_id,
               artifact.locale,artifact.metadata,
               snapshot.id AS snapshot_id,snapshot.created_at,
               artifact.metadata->>'source_build_number' AS source_build_number,
               artifact.metadata->>'source_build_version' AS source_build_version,
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
          AND artifact.metadata->>'source_build_number' ~ '^[0-9]+$'
          AND COALESCE(artifact.metadata->>'source_build_version','')<>''
    ), complete_sweeps AS (
        SELECT record_key,snapshot_id,max(created_at) AS sweep_at,
               bool_or(locale='en_US') AS has_en,
               bool_or(locale='ru_RU') AS has_ru,
               bool_and(source_build_matches) AS source_build_matches,
               min(source_build_number) AS source_build_number,
               min(source_build_version) AS source_build_version,
               (array_agg(artifact_id ORDER BY created_at DESC,locale DESC))[1] AS latest_artifact_id
        FROM unavailable
        GROUP BY record_key,snapshot_id
        HAVING bool_or(locale='en_US') AND bool_or(locale='ru_RU')
           AND count(DISTINCT source_build_number)=1
           AND count(DISTINCT source_build_version)=1
    ), ranked_sweeps AS (
        SELECT complete_sweeps.*,
               row_number() OVER (
                   PARTITION BY record_key ORDER BY sweep_at DESC,snapshot_id DESC
               ) AS sweep_rank
        FROM complete_sweeps
    ), confirmed_mismatch AS (
        SELECT record_key,count(*) AS sweep_count,
               min(sweep_at) AS first_sweep_at,max(sweep_at) AS last_sweep_at,
               min(source_build_number) AS source_build_number,
               min(source_build_version) AS source_build_version,
               (array_agg(latest_artifact_id ORDER BY sweep_at DESC))[1] AS latest_artifact_id
        FROM ranked_sweeps
        WHERE sweep_rank<=2
        GROUP BY record_key
        HAVING count(*)=2
           AND bool_and(NOT source_build_matches)
           AND count(DISTINCT source_build_number)=1
           AND count(DISTINCT source_build_version)=1
           AND max(sweep_at)-min(sweep_at) >= interval '24 hours'
    ), source_builds AS (
        SELECT mismatch.*,source_build.id AS source_build_id
        FROM confirmed_mismatch mismatch
        JOIN target_build target ON true
        JOIN game_builds source_build
          ON source_build.product_id=target.product_id
         AND source_build.build_number=mismatch.source_build_number::bigint
         AND source_build.version=mismatch.source_build_version
    ), proved_comparisons AS (
        SELECT source.*
        FROM source_builds source
        JOIN target_build target ON true
        WHERE EXISTS (
            SELECT 1
            FROM catalog_source_artifacts artifact
            JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
            WHERE artifact.build_id=source.source_build_id
              AND artifact.source='wago_tools' AND artifact.artifact_key='QuestV2'
              AND artifact.locale='en_US' AND artifact.status='ready'
              AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
              AND snapshot.status IN ('validated','published')
        )
          AND EXISTS (
            SELECT 1
            FROM catalog_source_artifacts artifact
            JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
            WHERE artifact.build_id=target.id
              AND artifact.source='wago_tools' AND artifact.artifact_key='QuestV2'
              AND artifact.locale='en_US' AND artifact.status='ready'
              AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
              AND snapshot.status IN ('validated','published')
        )
    ), stable_candidates AS (
        SELECT comparison.*,
               split_part(comparison.record_key,'/',2)::bigint AS external_id,
               source_row.content_hash AS source_row_hash,
               target_row.content_hash AS target_row_hash
        FROM proved_comparisons comparison
        JOIN target_build target ON true
        LEFT JOIN catalog_db2_rows source_row
          ON source_row.build_id=comparison.source_build_id
         AND source_row.table_name='QuestV2' AND source_row.locale='en_US'
         AND source_row.row_id=split_part(comparison.record_key,'/',2)::bigint
        LEFT JOIN catalog_db2_rows target_row
          ON target_row.build_id=target.id
         AND target_row.table_name='QuestV2' AND target_row.locale='en_US'
         AND target_row.row_id=split_part(comparison.record_key,'/',2)::bigint
        WHERE (source_row.row_id IS NULL AND target_row.row_id IS NULL)
           OR (source_row.row_id IS NOT NULL AND target_row.row_id IS NOT NULL
               AND source_row.content_hash=target_row.content_hash)
    ), official_success AS (
        SELECT document.build_id,document.entity_type,document.external_id
        FROM catalog_entity_source_documents document
        JOIN catalog_source_artifacts artifact ON artifact.id=document.source_artifact_id
        WHERE document.source='blizzard_api'
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL
          AND artifact.byte_size IS NOT NULL
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
          AND entity.entity_type='quest'
    )
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='official_not_found_stable_source_build',
        source_artifact_id=candidate.latest_artifact_id,
        evidence=jsonb_build_object(
            'entity_type','quest',
            'external_id',candidate.external_id,
            'official_not_found','stable_source_build_confirmed',
            'http_status',404,
            'locales',jsonb_build_array('en_US','ru_RU'),
            'complete_sweep_count',candidate.sweep_count,
            'first_sweep_at',candidate.first_sweep_at,
            'last_sweep_at',candidate.last_sweep_at,
            'minimum_sweep_spacing','24 hours',
            'source_build_number',candidate.source_build_number,
            'source_build_version',candidate.source_build_version,
            'target_build_id',target_build_id,
            'quest_v2_stable',true,
            'quest_v2_row_present',candidate.target_row_hash IS NOT NULL,
            'source_record_key',candidate.record_key),
        rule_version='quest-localization-usability-v3',
        assessed_at=now()
    FROM stable_candidates candidate
    WHERE usability.product_id=(SELECT product_id FROM target_build)
      AND usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.external_id=candidate.external_id
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
      )
      AND NOT EXISTS (
          SELECT 1 FROM official_success success
          WHERE success.build_id=target_build_id
            AND success.entity_type='quest'
            AND success.external_id=usability.external_id
      );
    GET DIAGNOSTICS stable_mismatch_affected=ROW_COUNT;

    RETURN baseline_affected+stable_mismatch_affected;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION catalog_refresh_quest_usability(BIGINT);
ALTER FUNCTION catalog_refresh_quest_usability_v2(BIGINT)
    RENAME TO catalog_refresh_quest_usability;
