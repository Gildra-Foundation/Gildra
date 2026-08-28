-- +goose Up
-- Multiple immutable observations may legitimately point to identical bytes.
-- The content-addressed object is shared; uniqueness belongs to the hash on
-- disk, not to one catalog_entity_media row.
DROP INDEX catalog_entity_media_cache_key_idx;
CREATE INDEX catalog_entity_media_cache_key_idx
    ON catalog_entity_media(cache_key) WHERE cache_key IS NOT NULL;

-- +goose Down
DROP INDEX catalog_entity_media_cache_key_idx;
CREATE UNIQUE INDEX catalog_entity_media_cache_key_idx
    ON catalog_entity_media(cache_key) WHERE cache_key IS NOT NULL;
