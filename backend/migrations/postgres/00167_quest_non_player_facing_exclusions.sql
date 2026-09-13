-- +goose Up
-- Finish the player-facing quest denominator without fabricating localizations.
-- Raw entities and source documents remain stored. Every rule is reversible on
-- the next refresh because the preceding classifier first restores the baseline
-- decision from current evidence.
ALTER FUNCTION catalog_refresh_quest_usability(BIGINT)
    RENAME TO catalog_refresh_quest_usability_v4;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_quest_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    baseline_affected BIGINT;
    technical_affected BIGINT;
    blank_ru_affected BIGINT;
    registry_only_affected BIGINT;
BEGIN
    SELECT catalog_refresh_quest_usability_v4(target_build_id)
    INTO baseline_affected;

    -- Explicit Blizzard/editorial markers that are not player-facing quest
    -- titles. Keep this deliberately phrase-based instead of matching broad
    -- words that could occur in legitimate localized names.
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='technical_or_placeholder_marker',
        evidence=usability.evidence||jsonb_build_object(
            'technical_marker','extended_non_player_title',
            'english_name',localization.name,
            'build_id',target_build_id),
        rule_version='quest-localization-usability-v5',
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
          '(^|[[:space:]_:[(<>-])(reuse( me| as wq| quest bit)?|not[[:space:]_-]*used|old not used|tbd|dnt|tracking quest|lfgdungeons|navtest|testquest|to deprecate|deprecates|poc|choice ui|distance tracker)([[:space:]_:)<>-]|$)|^(bfa|legion|dragonflight)[[:space:](0-9)-]+[eh]$|^northshire (sprint|dash)|^south sprint|^conditional -';
    GET DIAGNOSTICS technical_affected=ROW_COUNT;

    -- Some official ru_RU detail documents contain a blank title (and may
    -- even contain fallback prose in another language). Such a record is not
    -- a truthful Russian localization. Exclude it from the bilingual public
    -- denominator until a later official document supplies a non-empty title.
    WITH blank_ru AS (
        SELECT DISTINCT ON (document.external_id)
               document.external_id,document.source_artifact_id,document.imported_at
        FROM catalog_entity_source_documents document
        JOIN catalog_source_artifacts artifact ON artifact.id=document.source_artifact_id
        WHERE document.build_id=target_build_id
          AND document.entity_type='quest'
          AND document.source='blizzard_api' AND document.locale='ru_RU'
          AND artifact.source='blizzard_api' AND artifact.locale='ru_RU'
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
          AND COALESCE(BTRIM(document.payload->>'title'),'')=''
          AND NOT EXISTS (
              SELECT 1
              FROM catalog_entity_source_documents newer
              JOIN catalog_source_artifacts newer_artifact ON newer_artifact.id=newer.source_artifact_id
              WHERE newer.build_id=document.build_id
                AND newer.entity_type='quest'
                AND newer.external_id=document.external_id
                AND newer.source='blizzard_api' AND newer.locale='ru_RU'
                AND newer_artifact.source='blizzard_api'
                AND newer_artifact.locale='ru_RU'
                AND newer_artifact.status='ready'
                AND newer_artifact.content_hash IS NOT NULL
                AND newer_artifact.byte_size IS NOT NULL
                AND COALESCE(BTRIM(newer.payload->>'title'),'')<>''
          )
        ORDER BY document.external_id,document.imported_at DESC
    )
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='official_blank_russian_title',
        source_artifact_id=blank.source_artifact_id,
        evidence=usability.evidence||jsonb_build_object(
            'official_russian_title','blank',
            'official_document_at',blank.imported_at,
            'build_id',target_build_id),
        rule_version='quest-localization-usability-v5',
        assessed_at=now()
    FROM blank_ru blank
    WHERE usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.external_id=blank.external_id
      AND usability.decision='review'
      AND usability.rule_version NOT LIKE 'midnight-%'
      AND usability.reason_code='missing_russian_name';
    GET DIAGNOSTICS blank_ru_affected=ROW_COUNT;

    -- A QuestV2 identity newly added after the API source build, with no name,
    -- structured quest row, objective, line, or resolved external reference,
    -- is a non-publishable registry reservation. Preserve it raw and re-evaluate
    -- automatically when any player-facing evidence arrives.
    WITH target_build AS (
        SELECT id,product_id,build_number,version
        FROM game_builds
        WHERE id=target_build_id
          AND product_id=(SELECT id FROM game_products WHERE slug='wow')
    ), unavailable AS (
        SELECT (record.payload->>'external_id')::bigint AS external_id,
               artifact.id AS artifact_id,artifact.locale,
               snapshot.id AS snapshot_id,snapshot.release_id,snapshot.created_at,
               artifact.metadata->>'source_build_number' AS source_build_number,
               artifact.metadata->>'source_build_version' AS source_build_version,
               (artifact.metadata->>'source_build_number'=target.build_number::text
                AND artifact.metadata->>'source_build_version'=target.version) AS source_build_matches
        FROM catalog_source_records record
        JOIN catalog_source_artifacts artifact ON artifact.id=record.artifact_id
        JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
        JOIN target_build target ON target.id=artifact.build_id
        WHERE artifact.build_id=target_build_id
          AND artifact.source='blizzard_api'
          AND artifact.artifact_key='battlenet-missing/quest'
          AND artifact.locale IN ('en_US','ru_RU')
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
          AND snapshot.status IN ('validated','published')
          AND record.record_key LIKE 'unavailable/%'
          AND record.payload->>'entity_type'='quest'
          AND record.payload->>'external_id' ~ '^[0-9]+$'
          AND record.payload->>'external_id'=split_part(record.record_key,'/',2)
          AND record.payload->>'locale'=artifact.locale
          AND record.payload->>'status'='unavailable'
          AND record.payload->>'http_status'='404'
          AND record.payload->>'reason'='detail_not_found'
          AND artifact.metadata->>'source_build_number' ~ '^[0-9]+$'
          AND COALESCE(artifact.metadata->>'source_build_version','')<>''
          AND snapshot.release_id IS NOT NULL
    ), complete_sweeps AS (
        SELECT external_id,snapshot_id,release_id,max(created_at) AS sweep_at,
               bool_and(source_build_matches) AS source_build_matches,
               min(source_build_number) AS source_build_number,
               min(source_build_version) AS source_build_version,
               (array_agg(artifact_id ORDER BY created_at DESC,locale DESC))[1] AS latest_artifact_id
        FROM unavailable
        GROUP BY external_id,snapshot_id,release_id
        HAVING bool_or(locale='en_US') AND bool_or(locale='ru_RU')
           AND count(DISTINCT source_build_number)=1
           AND count(DISTINCT source_build_version)=1
    ), latest_sweep AS (
        SELECT DISTINCT ON (external_id) *
        FROM complete_sweeps
        ORDER BY external_id,sweep_at DESC,snapshot_id DESC
    ), latest_mismatch AS (
        SELECT * FROM latest_sweep WHERE NOT source_build_matches
    ), complete_indexes AS (
        SELECT snapshot.release_id,
               min(artifact.metadata->>'source_build_number') AS source_build_number,
               min(artifact.metadata->>'source_build_version') AS source_build_version
        FROM catalog_source_artifacts artifact
        JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
        JOIN target_build target ON target.id=artifact.build_id
        WHERE artifact.source='blizzard_api'
          AND artifact.artifact_key='battlenet/quest'
          AND artifact.locale IN ('en_US','ru_RU')
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
          AND artifact.metadata->>'proof_scope'='source_record_manifest_v1'
          AND artifact.metadata->>'bounded'='false'
          AND artifact.metadata->>'source_build_number' ~ '^[0-9]+$'
          AND COALESCE(artifact.metadata->>'source_build_version','')<>''
          AND snapshot.release_id IS NOT NULL
          AND snapshot.status IN ('validated','published')
        GROUP BY snapshot.release_id
        HAVING bool_or(artifact.locale='en_US') AND bool_or(artifact.locale='ru_RU')
           AND count(DISTINCT artifact.metadata->>'source_build_number')=1
           AND count(DISTINCT artifact.metadata->>'source_build_version')=1
    ), new_registry_rows AS (
        SELECT mismatch.external_id,mismatch.latest_artifact_id AS artifact_id,
               mismatch.source_build_number::bigint AS source_build_number,
               mismatch.source_build_version
        FROM latest_mismatch mismatch
        JOIN target_build target ON true
        JOIN game_builds source_build
          ON source_build.product_id=target.product_id
         AND source_build.build_number=mismatch.source_build_number::bigint
         AND source_build.version=mismatch.source_build_version
        JOIN complete_indexes index_proof
          ON index_proof.release_id=mismatch.release_id
         AND index_proof.source_build_number=mismatch.source_build_number
         AND index_proof.source_build_version=mismatch.source_build_version
        JOIN catalog_db2_rows target_row
          ON target_row.build_id=target_build_id
         AND target_row.table_name='QuestV2' AND target_row.locale='en_US'
         AND target_row.row_id=mismatch.external_id
        LEFT JOIN catalog_db2_rows source_row
          ON source_row.build_id=source_build.id
         AND source_row.table_name='QuestV2' AND source_row.locale='en_US'
         AND source_row.row_id=mismatch.external_id
        WHERE source_row.row_id IS NULL
          AND EXISTS (
              SELECT 1 FROM catalog_source_artifacts artifact
              JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
              WHERE artifact.build_id=source_build.id
                AND artifact.source='wago_tools' AND artifact.artifact_key='QuestV2'
                AND artifact.locale='en_US' AND artifact.status='ready'
                AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
                AND snapshot.status IN ('validated','published')
          )
          AND EXISTS (
              SELECT 1 FROM catalog_source_artifacts artifact
              JOIN catalog_snapshots snapshot ON snapshot.id=artifact.snapshot_id
              WHERE artifact.build_id=target.id
                AND artifact.source='wago_tools' AND artifact.artifact_key='QuestV2'
                AND artifact.locale='en_US' AND artifact.status='ready'
                AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
                AND snapshot.status IN ('validated','published')
          )
          AND NOT EXISTS (
              SELECT 1
              FROM catalog_source_records index_record
              JOIN catalog_source_artifacts index_artifact ON index_artifact.id=index_record.artifact_id
              JOIN catalog_snapshots index_snapshot ON index_snapshot.id=index_artifact.snapshot_id
              WHERE index_snapshot.release_id=mismatch.release_id
                AND index_artifact.source='blizzard_api'
                AND index_artifact.artifact_key='battlenet/quest'
                AND index_artifact.locale IN ('en_US','ru_RU')
                AND index_artifact.status='ready'
                AND index_record.record_key=mismatch.external_id::text
          )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_quest_details detail
              WHERE detail.build_id=target_build_id AND detail.quest_id=mismatch.external_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_quest_objectives objective
              WHERE objective.build_id=target_build_id AND objective.quest_id=mismatch.external_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_quest_line_entries line
              WHERE line.build_id=target_build_id AND line.quest_id=mismatch.external_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM catalog_staged_source_references reference
              JOIN catalog_staged_source_nodes node ON node.id=reference.node_id
              WHERE reference.target_type='quest'
                AND reference.target_external_id=mismatch.external_id
                AND node.build_id=target_build_id
                AND node.resolution_status='resolved'
                AND reference.target_entity_id IS NOT NULL
          )
    )
    UPDATE catalog_entity_usability usability
    SET decision='excluded',
        reason_code='unresolved_new_registry_only',
        source_artifact_id=registry.artifact_id,
        evidence=usability.evidence||jsonb_build_object(
            'registry_only',true,
            'player_facing_evidence',false,
            'source_build_number',registry.source_build_number,
            'source_build_version',registry.source_build_version,
            'target_build_id',target_build_id),
        rule_version='quest-localization-usability-v5',
        assessed_at=now()
    FROM new_registry_rows registry
    WHERE usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.external_id=registry.external_id
      AND usability.decision='review'
      AND usability.rule_version NOT LIKE 'midnight-%'
      AND NOT EXISTS (
          SELECT 1
          FROM game_entities entity
          JOIN game_entity_versions version ON version.id=entity.published_version_id
          LEFT JOIN game_entity_localizations en
            ON en.version_id=version.id AND en.locale='en_US'
          LEFT JOIN game_entity_localizations ru
            ON ru.version_id=version.id AND ru.locale='ru_RU'
          WHERE entity.product_id=usability.product_id
            AND entity.entity_type='quest'
            AND entity.external_id=usability.external_id
            AND version.build_id=target_build_id
            AND (COALESCE(BTRIM(en.name),'')<>'' OR COALESCE(BTRIM(ru.name),'')<>'')
      )
      AND NOT EXISTS (
          SELECT 1 FROM catalog_entity_source_documents document
          JOIN catalog_source_artifacts artifact ON artifact.id=document.source_artifact_id
          WHERE document.build_id=target_build_id
            AND document.entity_type='quest'
            AND document.external_id=usability.external_id
            AND document.source='blizzard_api'
            AND artifact.status='ready'
            AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
      );
    GET DIAGNOSTICS registry_only_affected=ROW_COUNT;

    RETURN baseline_affected+technical_affected+blank_ru_affected+registry_only_affected;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION catalog_refresh_quest_usability(BIGINT);
ALTER FUNCTION catalog_refresh_quest_usability_v4(BIGINT)
    RENAME TO catalog_refresh_quest_usability;
