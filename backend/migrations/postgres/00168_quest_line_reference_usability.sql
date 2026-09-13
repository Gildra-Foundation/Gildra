-- +goose Up
-- QuestLineXQuest can retain references to quest IDs that no longer have a
-- QuestV2 or QuestV2CliTask row in the selected client build. Keep those raw
-- relationships, but give every registry ID an explicit non-public decision
-- instead of inventing a quest entity or localization for an orphan pointer.
ALTER FUNCTION catalog_refresh_quest_usability(BIGINT)
    RENAME TO catalog_refresh_quest_usability_v5;

-- +goose StatementBegin
CREATE FUNCTION catalog_refresh_quest_usability(target_build_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    baseline_affected BIGINT;
    orphan_affected BIGINT;
    stale_affected BIGINT;
BEGIN
    SELECT catalog_refresh_quest_usability_v5(target_build_id)
    INTO baseline_affected;

    WITH target_build AS (
        SELECT id,product_id FROM game_builds WHERE id=target_build_id
    ), orphan_references AS (
        SELECT registry.quest_id AS external_id,
               (array_agg(DISTINCT line.quest_line_id ORDER BY line.quest_line_id))[1] AS first_quest_line_id,
               count(DISTINCT line.quest_line_id) AS quest_line_count,
               (array_agg(raw.source_artifact_id ORDER BY raw.imported_at DESC)
                    FILTER (WHERE raw.source_artifact_id IS NOT NULL))[1] AS source_artifact_id
        FROM catalog_quest_registry registry
        JOIN target_build target ON target.id=registry.build_id
        JOIN catalog_quest_line_entries line
          ON line.build_id=registry.build_id AND line.quest_id=registry.quest_id
        JOIN catalog_db2_rows raw
          ON raw.build_id=registry.build_id
         AND raw.table_name='QuestLineXQuest' AND raw.locale='en_US'
         AND raw.payload->>'QuestID'=registry.quest_id::text
        JOIN catalog_source_artifacts artifact ON artifact.id=raw.source_artifact_id
          AND artifact.status='ready'
          AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
        WHERE registry.build_id=target_build_id
          AND NOT EXISTS (
              SELECT 1 FROM catalog_db2_rows quest
              WHERE quest.build_id=registry.build_id
                AND quest.table_name IN ('QuestV2','QuestV2CliTask')
                AND quest.locale='en_US' AND quest.row_id=registry.quest_id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM game_entities entity
              JOIN game_entity_versions version ON version.entity_id=entity.id
              WHERE entity.product_id=target.product_id
                AND entity.entity_type='quest'
                AND entity.external_id=registry.quest_id
                AND entity.deleted_at IS NULL
                AND version.build_id=target_build_id
          )
        GROUP BY registry.quest_id
    )
    INSERT INTO catalog_entity_usability(
        product_id,build_id,entity_type,external_id,decision,reason_code,
        source_artifact_id,evidence,rule_version,assessed_at
    )
    SELECT target.product_id,target_build_id,'quest',orphan.external_id,
           'excluded','orphaned_quest_line_reference',orphan.source_artifact_id,
           jsonb_build_object(
               'entity_type','quest',
               'external_id',orphan.external_id,
               'registry_present',true,
               'quest_v2_present',false,
               'client_task_present',false,
               'quest_line_reference',true,
               'quest_line_count',orphan.quest_line_count,
               'first_quest_line_id',orphan.first_quest_line_id,
               'build_id',target_build_id),
           'quest-localization-usability-v6',now()
    FROM orphan_references orphan
    JOIN target_build target ON true
    ON CONFLICT(product_id,build_id,entity_type,external_id) DO UPDATE SET
        decision=EXCLUDED.decision,
        reason_code=EXCLUDED.reason_code,
        source_artifact_id=EXCLUDED.source_artifact_id,
        evidence=EXCLUDED.evidence,
        rule_version=EXCLUDED.rule_version,
        assessed_at=EXCLUDED.assessed_at
    WHERE catalog_entity_usability.rule_version NOT LIKE 'midnight-%';
    GET DIAGNOSTICS orphan_affected=ROW_COUNT;

    DELETE FROM catalog_entity_usability usability
    WHERE usability.build_id=target_build_id
      AND usability.entity_type='quest'
      AND usability.rule_version='quest-localization-usability-v6'
      AND NOT EXISTS (
          SELECT 1
          FROM catalog_quest_registry registry
          JOIN catalog_quest_line_entries line
            ON line.build_id=registry.build_id AND line.quest_id=registry.quest_id
          WHERE registry.build_id=target_build_id
            AND registry.quest_id=usability.external_id
            AND NOT EXISTS (
                SELECT 1 FROM catalog_db2_rows quest
                WHERE quest.build_id=registry.build_id
                  AND quest.table_name IN ('QuestV2','QuestV2CliTask')
                  AND quest.locale='en_US' AND quest.row_id=registry.quest_id
            )
            AND EXISTS (
                SELECT 1 FROM catalog_db2_rows raw
                JOIN catalog_source_artifacts artifact ON artifact.id=raw.source_artifact_id
                WHERE raw.build_id=registry.build_id
                  AND raw.table_name='QuestLineXQuest' AND raw.locale='en_US'
                  AND raw.payload->>'QuestID'=registry.quest_id::text
                  AND artifact.status='ready'
                  AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
            )
      );
    GET DIAGNOSTICS stale_affected=ROW_COUNT;

    RETURN baseline_affected+orphan_affected+stale_affected;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION catalog_refresh_quest_usability(BIGINT);
ALTER FUNCTION catalog_refresh_quest_usability_v5(BIGINT)
    RENAME TO catalog_refresh_quest_usability;
DELETE FROM catalog_entity_usability
WHERE rule_version='quest-localization-usability-v6';
