-- +goose NO TRANSACTION
-- +goose Up
-- Production applied these statements by hand on 2026-11-11 (see
-- README-slim-unused-indexes.md); every statement is idempotent so the
-- migration is a no-op there and brings other databases to the same shape.

-- Foreign-key support for source_artifact_id needs only that column; the wide
-- composite copies were 5.8 GB and 3.4 GB. Deduplication keeps these small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_entity_localization_artifacts_source_artifact_idx
    ON catalog_entity_localization_artifacts (source_artifact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_entity_version_artifacts_source_artifact_idx
    ON catalog_entity_version_artifacts (source_artifact_id);
DROP INDEX CONCURRENTLY IF EXISTS catalog_entity_localization_artifacts_source_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_entity_version_artifacts_source_idx;

-- Never scanned in production.
DROP INDEX CONCURRENTLY IF EXISTS game_entity_localizations_locale_slug_idx;
DROP INDEX CONCURRENTLY IF EXISTS game_entity_versions_source_idx;

-- snapshot_id is only needed for ON DELETE SET NULL from catalog_snapshots.
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_db2_rows_snapshot_id_idx
    ON catalog_db2_rows (snapshot_id) WHERE snapshot_id IS NOT NULL;
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_snapshot_idx;

ALTER TABLE catalog_db2_rows SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE game_entity_localizations SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE game_entity_versions SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE catalog_entity_localization_artifacts SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE catalog_entity_version_artifacts SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE catalog_entity_media SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);

-- +goose Down
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_db2_rows_snapshot_idx
    ON catalog_db2_rows (snapshot_id, table_name, locale, row_id) WHERE snapshot_id IS NOT NULL;
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_snapshot_id_idx;
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entity_versions_source_idx
    ON game_entity_versions (source, build_id, entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS game_entity_localizations_locale_slug_idx
    ON game_entity_localizations (locale, slug, version_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_entity_version_artifacts_source_idx
    ON catalog_entity_version_artifacts (source_artifact_id, version_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_entity_localization_artifacts_source_idx
    ON catalog_entity_localization_artifacts (source_artifact_id, version_id, locale);
DROP INDEX CONCURRENTLY IF EXISTS catalog_entity_version_artifacts_source_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_entity_localization_artifacts_source_artifact_idx;
ALTER TABLE catalog_db2_rows RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
ALTER TABLE game_entity_localizations RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
ALTER TABLE game_entity_versions RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
ALTER TABLE catalog_entity_localization_artifacts RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
ALTER TABLE catalog_entity_version_artifacts RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
ALTER TABLE catalog_entity_media RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
