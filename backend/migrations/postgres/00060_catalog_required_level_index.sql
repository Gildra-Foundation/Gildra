-- +goose NO TRANSACTION
-- +goose Up
-- Required-level filters are part of the public item directory. Keep the
-- version id in the index so the filter can join back to the canonical row
-- without scanning the complete item projection.
CREATE INDEX CONCURRENTLY catalog_items_required_level_idx
    ON catalog_items (required_level, version_id)
    WHERE required_level IS NOT NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_items_required_level_idx;
