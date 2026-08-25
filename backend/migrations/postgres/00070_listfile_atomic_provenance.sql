-- +goose Up
ALTER TABLE catalog_import_runs
    DROP CONSTRAINT catalog_import_runs_source_check;

ALTER TABLE catalog_import_runs
    ADD CONSTRAINT catalog_import_runs_source_check
    CHECK (source IN ('battlenet', 'casc_db2', 'wago_tools', 'raidbots', 'wow_listfile'));

ALTER TABLE catalog_file_assets
    ADD COLUMN snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    ADD COLUMN source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL;

CREATE INDEX catalog_file_assets_snapshot_idx
    ON catalog_file_assets(snapshot_id, file_data_id)
    WHERE snapshot_id IS NOT NULL;

CREATE INDEX catalog_file_assets_artifact_idx
    ON catalog_file_assets(source_artifact_id, file_data_id)
    WHERE source_artifact_id IS NOT NULL;

CREATE TABLE catalog_file_asset_versions (
    snapshot_id UUID NOT NULL REFERENCES catalog_snapshots(id) ON DELETE CASCADE,
    file_data_id BIGINT NOT NULL CHECK (file_data_id > 0),
    path TEXT NOT NULL,
    icon_name TEXT,
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://github[.]com/wowdev/wow-listfile/'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, file_data_id)
);

CREATE INDEX catalog_file_asset_versions_file_idx
    ON catalog_file_asset_versions(file_data_id, snapshot_id);

CREATE INDEX catalog_file_asset_versions_artifact_idx
    ON catalog_file_asset_versions(source_artifact_id, file_data_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_file_asset_versions;
DROP INDEX IF EXISTS catalog_file_assets_artifact_idx;
DROP INDEX IF EXISTS catalog_file_assets_snapshot_idx;
ALTER TABLE catalog_file_assets
    DROP COLUMN IF EXISTS source_artifact_id,
    DROP COLUMN IF EXISTS snapshot_id;

ALTER TABLE catalog_import_runs
    DROP CONSTRAINT catalog_import_runs_source_check;

ALTER TABLE catalog_import_runs
    ADD CONSTRAINT catalog_import_runs_source_check
    -- Keep historical listfile runs valid if the schema is rolled back after use.
    CHECK (source IN ('battlenet', 'casc_db2', 'wago_tools', 'raidbots', 'wow_listfile'));
