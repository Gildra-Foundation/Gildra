-- +goose Up
-- Keep deletes, snapshot retirement and referential checks predictable as the
-- append-only source layer grows. PostgreSQL does not create indexes on the
-- referencing side of foreign keys automatically.
CREATE INDEX catalog_acquisition_observations_build_idx
    ON catalog_acquisition_observations (build_id);
CREATE INDEX catalog_acquisition_observations_artifact_idx
    ON catalog_acquisition_observations (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

CREATE INDEX catalog_class_trait_trees_artifact_idx
    ON catalog_class_trait_trees (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_db2_rows_artifact_idx
    ON catalog_db2_rows (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_entity_icons_artifact_idx
    ON catalog_entity_icons (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_item_conversions_artifact_idx
    ON catalog_item_conversions (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_item_level_curve_points_artifact_idx
    ON catalog_item_level_curve_points (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_item_specialization_rules_artifact_idx
    ON catalog_item_specialization_rules (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_item_variants_snapshot_idx
    ON catalog_item_variants (snapshot_id)
    WHERE snapshot_id IS NOT NULL;
CREATE INDEX catalog_item_variants_artifact_idx
    ON catalog_item_variants (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_snapshots_build_idx
    ON catalog_snapshots (build_id);

CREATE INDEX dataset_runs_lkg_snapshot_idx
    ON dataset_runs (dataset_id, lkg_snapshot_id)
    WHERE lkg_snapshot_id IS NOT NULL;
CREATE INDEX dataset_runs_snapshot_idx
    ON dataset_runs (dataset_id, snapshot_id)
    WHERE snapshot_id IS NOT NULL;
CREATE INDEX datasets_current_snapshot_idx
    ON datasets (id, current_snapshot_id)
    WHERE current_snapshot_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS datasets_current_snapshot_idx;
DROP INDEX IF EXISTS dataset_runs_snapshot_idx;
DROP INDEX IF EXISTS dataset_runs_lkg_snapshot_idx;
DROP INDEX IF EXISTS catalog_snapshots_build_idx;
DROP INDEX IF EXISTS catalog_item_variants_artifact_idx;
DROP INDEX IF EXISTS catalog_item_variants_snapshot_idx;
DROP INDEX IF EXISTS catalog_item_specialization_rules_artifact_idx;
DROP INDEX IF EXISTS catalog_item_level_curve_points_artifact_idx;
DROP INDEX IF EXISTS catalog_item_conversions_artifact_idx;
DROP INDEX IF EXISTS catalog_entity_icons_artifact_idx;
DROP INDEX IF EXISTS catalog_db2_rows_artifact_idx;
DROP INDEX IF EXISTS catalog_class_trait_trees_artifact_idx;
DROP INDEX IF EXISTS catalog_acquisition_observations_artifact_idx;
DROP INDEX IF EXISTS catalog_acquisition_observations_build_idx;
