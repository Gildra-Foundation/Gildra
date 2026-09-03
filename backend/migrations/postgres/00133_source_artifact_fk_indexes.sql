-- +goose NO TRANSACTION
-- +goose Up
-- Foreign keys onto catalog_source_artifacts and catalog_snapshots without a
-- supporting index turned every failed-snapshot cleanup into hundreds of
-- sequential scans: the ON DELETE SET NULL actions on catalog_spells (2M rows,
-- four artifact columns) and the RESTRICT check on catalog_entity_media ran
-- once per deleted artifact.  Resuming release 51dbfc88 on 2026-09-03 sat in
-- COMMIT for eight hours and timed out.  The indexes are created concurrently
-- so the migration never blocks readers or a running import.
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_spells_cast_time_artifact_idx
    ON catalog_spells(cast_time_source_artifact_id) WHERE cast_time_source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_spells_cooldown_artifact_idx
    ON catalog_spells(cooldown_source_artifact_id) WHERE cooldown_source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_spells_misc_artifact_idx
    ON catalog_spells(misc_source_artifact_id) WHERE misc_source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_spells_range_artifact_idx
    ON catalog_spells(range_source_artifact_id) WHERE range_source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_entity_media_source_artifact_idx
    ON catalog_entity_media(source_artifact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_backup_manifests_snapshot_idx
    ON catalog_backup_manifests(snapshot_id);
-- game_entities.latest_version_id / published_version_id reference
-- game_entity_versions through DEFERRABLE INITIALLY DEFERRED constraints, so
-- their NO ACTION checks run at COMMIT for every deleted version.  The
-- existing back-reference indexes are partial on deleted_at IS NULL and the
-- RI check cannot use them: deleting 213k versions queued ~427k sequential
-- scans of game_entities at commit.  These indexes cover the check itself.
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entities_latest_version_ref_idx
    ON game_entities(latest_version_id) WHERE latest_version_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entities_published_version_ref_idx
    ON game_entities(published_version_id) WHERE published_version_id IS NOT NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS game_entities_published_version_ref_idx;
DROP INDEX CONCURRENTLY IF EXISTS game_entities_latest_version_ref_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_backup_manifests_snapshot_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_entity_media_source_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_spells_range_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_spells_misc_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_spells_cooldown_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_spells_cast_time_artifact_idx;
