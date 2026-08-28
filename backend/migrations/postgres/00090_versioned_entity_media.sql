-- +goose Up
-- Media imports are observations, not mutable current-state rows. Keeping one
-- row per proved artifact prevents a failed refresh from replacing the last
-- successfully verified asset and lets public readers choose the newest ready
-- observation atomically.
ALTER TABLE catalog_entity_media
    DROP CONSTRAINT catalog_entity_media_build_id_entity_type_external_id_media_key;

DROP INDEX catalog_entity_media_primary_idx;

ALTER TABLE catalog_entity_media
    DROP CONSTRAINT catalog_entity_media_source_artifact_id_fkey;

ALTER TABLE catalog_entity_media
    ALTER COLUMN source_artifact_id SET NOT NULL;

ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_source_artifact_id_fkey
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT;

ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_observation_unique
    UNIQUE (build_id, entity_type, external_id, media_kind, asset_key, locale, source, source_artifact_id);

CREATE UNIQUE INDEX catalog_entity_media_primary_idx
    ON catalog_entity_media (
        build_id, entity_type, external_id, media_kind, locale, source, source_artifact_id
    )
    WHERE is_primary;

-- +goose Down
DROP INDEX catalog_entity_media_primary_idx;

ALTER TABLE catalog_entity_media
    DROP CONSTRAINT catalog_entity_media_observation_unique;

-- A rollback returns to the previous current-state model and therefore keeps
-- only the newest observation for every old uniqueness key.
WITH ranked_primary AS (
    SELECT id,row_number() OVER (
        PARTITION BY build_id,entity_type,external_id,media_kind,locale,source
        ORDER BY updated_at DESC,created_at DESC,id DESC
    ) AS position
    FROM catalog_entity_media
    WHERE is_primary
)
DELETE FROM catalog_entity_media media
USING ranked_primary ranked
WHERE media.id=ranked.id AND ranked.position>1;

WITH ranked_assets AS (
    SELECT id,row_number() OVER (
        PARTITION BY build_id,entity_type,external_id,media_kind,asset_key,locale,source
        ORDER BY updated_at DESC,created_at DESC,id DESC
    ) AS position
    FROM catalog_entity_media
)
DELETE FROM catalog_entity_media media
USING ranked_assets ranked
WHERE media.id=ranked.id AND ranked.position>1;

ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_build_id_entity_type_external_id_media_key
    UNIQUE (build_id, entity_type, external_id, media_kind, asset_key, locale, source);

CREATE UNIQUE INDEX catalog_entity_media_primary_idx
    ON catalog_entity_media (build_id, entity_type, external_id, media_kind, locale, source)
    WHERE is_primary;

ALTER TABLE catalog_entity_media
    DROP CONSTRAINT catalog_entity_media_source_artifact_id_fkey;

ALTER TABLE catalog_entity_media
    ALTER COLUMN source_artifact_id DROP NOT NULL;

ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_source_artifact_id_fkey
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL;
