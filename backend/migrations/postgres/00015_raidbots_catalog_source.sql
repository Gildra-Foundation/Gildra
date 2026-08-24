-- +goose Up
ALTER TABLE catalog_import_runs
    DROP CONSTRAINT catalog_import_runs_source_check;

ALTER TABLE catalog_import_runs
    ADD CONSTRAINT catalog_import_runs_source_check
    CHECK (source IN ('battlenet', 'casc_db2', 'wago_tools', 'raidbots'));

-- +goose Down
ALTER TABLE catalog_import_runs
    DROP CONSTRAINT catalog_import_runs_source_check;

ALTER TABLE catalog_import_runs
    ADD CONSTRAINT catalog_import_runs_source_check
    CHECK (source IN ('battlenet', 'casc_db2', 'wago_tools'));
