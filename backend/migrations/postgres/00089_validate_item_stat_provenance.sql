-- +goose Up
ALTER TABLE catalog_item_stats VALIDATE CONSTRAINT catalog_item_stats_source_artifact_fk;
ALTER TABLE catalog_item_variant_stats VALIDATE CONSTRAINT catalog_item_variant_stats_source_artifact_fk;

-- +goose Down
-- Validation changes no schema shape. Migration 00087 owns the constraints.
SELECT 1;
