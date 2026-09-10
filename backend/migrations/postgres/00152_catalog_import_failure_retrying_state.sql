-- +goose Up
-- An executor needs a durable lease state. Without it, two schedulers can
-- select the same due failure before the product-level pipeline lock is held.
ALTER TABLE catalog_import_failure_queue
    DROP CONSTRAINT catalog_import_failure_queue_state_check;

ALTER TABLE catalog_import_failure_queue
    ADD CONSTRAINT catalog_import_failure_queue_state_check
    CHECK (state IN ('retry_scheduled','retrying','quarantined','resolved'));

CREATE INDEX catalog_import_failure_queue_retrying_idx
    ON catalog_import_failure_queue (updated_at)
    WHERE state='retrying';

-- +goose Down
DROP INDEX IF EXISTS catalog_import_failure_queue_retrying_idx;

ALTER TABLE catalog_import_failure_queue
    DROP CONSTRAINT catalog_import_failure_queue_state_check;

ALTER TABLE catalog_import_failure_queue
    ADD CONSTRAINT catalog_import_failure_queue_state_check
    CHECK (state IN ('retry_scheduled','quarantined','resolved'));
