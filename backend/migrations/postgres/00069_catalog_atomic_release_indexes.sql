-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY catalog_releases_product_status_idx
    ON catalog_releases (product_id, status, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY catalog_snapshots_release_idx
    ON catalog_snapshots (release_id, status, source, id)
    WHERE release_id IS NOT NULL;
CREATE INDEX CONCURRENTLY game_entities_published_version_idx
    ON game_entities (published_version_id, product_id, entity_type)
    WHERE published_version_id IS NOT NULL AND deleted_at IS NULL;
ALTER TABLE game_entities VALIDATE CONSTRAINT game_entities_published_version_fk;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entities_published_version_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_snapshots_release_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_releases_product_status_idx;
