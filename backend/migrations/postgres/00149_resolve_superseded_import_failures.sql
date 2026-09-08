-- +goose Up
-- Failed imports remain immutable history. A later successful import of the
-- same product, source and build proves that the earlier failure no longer
-- represents an active catalog risk, so close its queue record with evidence.
ALTER TABLE catalog_import_failure_queue
    ADD COLUMN resolution_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN resolution_summary TEXT NOT NULL DEFAULT '';

UPDATE catalog_import_failure_queue queue
SET state='resolved',
    resolution_code='superseded_by_same_build_success',
    resolution_summary='A later successful import exists for the same product, source, and build.',
    resolved_at=now(),
    updated_at=now()
FROM catalog_import_runs failed
WHERE queue.import_run_id=failed.id
  AND queue.state<>'resolved'
  AND failed.status='FAILED'
  AND EXISTS (
      SELECT 1 FROM catalog_import_runs succeeded
      WHERE succeeded.product_id=failed.product_id
        AND succeeded.build_id=failed.build_id
        AND succeeded.source=failed.source
        AND succeeded.status='SUCCEEDED'
        AND succeeded.finished_at>failed.started_at
  );

-- +goose Down
ALTER TABLE catalog_import_failure_queue
    DROP COLUMN IF EXISTS resolution_summary,
    DROP COLUMN IF EXISTS resolution_code;
