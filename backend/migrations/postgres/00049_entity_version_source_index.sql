-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY game_entity_versions_source_idx
    ON game_entity_versions(source,build_id,entity_id);

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entity_versions_source_idx;
