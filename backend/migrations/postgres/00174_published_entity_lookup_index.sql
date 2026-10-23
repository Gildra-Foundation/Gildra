-- +goose NO TRANSACTION
-- +goose Up
-- Catalog search joins every candidate localization to its published entity
-- (tens of thousands of probes for a common word) and then reads id,
-- product_id, entity_type and external_id from the heap. Carrying them in the
-- index makes both steps index-only scans.
CREATE INDEX CONCURRENTLY game_entities_published_lookup_idx
    ON game_entities (published_version_id)
    INCLUDE (id, product_id, entity_type, external_id)
    WHERE published_version_id IS NOT NULL AND deleted_at IS NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entities_published_lookup_idx;
