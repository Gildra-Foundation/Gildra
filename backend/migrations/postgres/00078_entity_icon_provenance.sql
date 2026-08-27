-- +goose Up
ALTER TABLE catalog_entity_icons
    ADD COLUMN file_data_id BIGINT
        CHECK (file_data_id IS NULL OR file_data_id > 0),
    ADD COLUMN asset_source_artifact_id UUID;

ALTER TABLE catalog_entity_icons
    ADD CONSTRAINT catalog_entity_icons_asset_source_artifact_fk
    FOREIGN KEY (asset_source_artifact_id)
    REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL
    NOT VALID;

CREATE INDEX catalog_entity_icons_file_data_idx
    ON catalog_entity_icons(file_data_id, entity_type)
    WHERE file_data_id IS NOT NULL;

CREATE INDEX catalog_entity_icons_asset_artifact_idx
    ON catalog_entity_icons(asset_source_artifact_id)
    WHERE asset_source_artifact_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_entity_icons_asset_artifact_idx;
DROP INDEX IF EXISTS catalog_entity_icons_file_data_idx;
ALTER TABLE catalog_entity_icons
    DROP CONSTRAINT IF EXISTS catalog_entity_icons_asset_source_artifact_fk,
    DROP COLUMN IF EXISTS asset_source_artifact_id,
    DROP COLUMN IF EXISTS file_data_id;
