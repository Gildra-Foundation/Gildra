-- +goose Up
-- Bounded preflight imports are useful diagnostics, but they are not complete
-- source artifacts and must never be indistinguishable from verified files.
ALTER TABLE catalog_source_artifacts
    DROP CONSTRAINT IF EXISTS catalog_source_artifacts_status_check;
ALTER TABLE catalog_source_artifacts
    ADD CONSTRAINT catalog_source_artifacts_status_check
    CHECK (status IN ('fetching', 'sampled', 'ready', 'failed')) NOT VALID;
ALTER TABLE catalog_source_artifacts
    VALIDATE CONSTRAINT catalog_source_artifacts_status_check;

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalog_source_artifacts WHERE status='sampled') THEN
        RAISE EXCEPTION 'cannot remove sampled artifact status while sampled rows exist';
    END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE catalog_source_artifacts
    DROP CONSTRAINT IF EXISTS catalog_source_artifacts_status_check;
ALTER TABLE catalog_source_artifacts
    ADD CONSTRAINT catalog_source_artifacts_status_check
    CHECK (status IN ('fetching', 'ready', 'failed')) NOT VALID;
ALTER TABLE catalog_source_artifacts
    VALIDATE CONSTRAINT catalog_source_artifacts_status_check;
