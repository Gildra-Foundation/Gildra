-- +goose Up
-- A DB2 table can legitimately be absent for a product/build (Wago returns
-- 404 when no export exists). Keep that fact explicit instead of turning a
-- predictable source gap into a failed import with no diagnostic state.
ALTER TABLE catalog_source_artifacts
    DROP CONSTRAINT IF EXISTS catalog_source_artifacts_status_check;
ALTER TABLE catalog_source_artifacts
    ADD CONSTRAINT catalog_source_artifacts_status_check
    CHECK (status IN ('fetching', 'sampled', 'ready', 'failed', 'unavailable')) NOT VALID;
ALTER TABLE catalog_source_artifacts
    VALIDATE CONSTRAINT catalog_source_artifacts_status_check;

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalog_source_artifacts WHERE status='unavailable') THEN
        RAISE EXCEPTION 'cannot remove unavailable artifact status while unavailable rows exist';
    END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE catalog_source_artifacts
    DROP CONSTRAINT IF EXISTS catalog_source_artifacts_status_check;
ALTER TABLE catalog_source_artifacts
    ADD CONSTRAINT catalog_source_artifacts_status_check
    CHECK (status IN ('fetching', 'sampled', 'ready', 'failed')) NOT VALID;
ALTER TABLE catalog_source_artifacts
    VALIDATE CONSTRAINT catalog_source_artifacts_status_check;
