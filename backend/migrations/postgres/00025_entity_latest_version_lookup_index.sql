-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY game_entities_latest_version_active_idx
    ON game_entities (latest_version_id, id)
    WHERE deleted_at IS NULL AND latest_version_id IS NOT NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entities_latest_version_active_idx;
