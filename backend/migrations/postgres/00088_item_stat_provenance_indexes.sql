-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY catalog_item_stats_artifact_idx
    ON catalog_item_stats(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_item_variant_stats_artifact_idx
    ON catalog_item_variant_stats(source_artifact_id) WHERE source_artifact_id IS NOT NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_item_variant_stats_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_item_stats_artifact_idx;
