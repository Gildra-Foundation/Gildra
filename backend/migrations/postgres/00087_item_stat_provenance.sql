-- +goose Up
ALTER TABLE catalog_item_stats
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_item_stats
    ADD CONSTRAINT catalog_item_stats_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_item_variant_stats
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_item_variant_stats
    ADD CONSTRAINT catalog_item_variant_stats_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

-- +goose Down
ALTER TABLE catalog_item_variant_stats
    DROP CONSTRAINT IF EXISTS catalog_item_variant_stats_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_item_stats
    DROP CONSTRAINT IF EXISTS catalog_item_stats_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
