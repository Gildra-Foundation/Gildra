-- +goose Up
-- Import failures need an operational state, rather than an unstructured log
-- message.  Keep the original run immutable and attach one actionable queue
-- record to it: transient source failures are scheduled for retry, while
-- credential, schema and integrity failures are quarantined for review.
ALTER TABLE catalog_import_runs
    ADD COLUMN failure_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN failure_retryable BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN retry_after TIMESTAMPTZ;

CREATE TABLE catalog_import_failure_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id UUID NOT NULL UNIQUE REFERENCES catalog_import_runs(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('retry_scheduled','quarantined','resolved')),
    failure_code TEXT NOT NULL,
    retry_after TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX catalog_import_failure_queue_due_idx
    ON catalog_import_failure_queue (state,retry_after,created_at)
    WHERE state='retry_scheduled';

CREATE INDEX catalog_import_runs_failure_idx
    ON catalog_import_runs (failure_code,started_at DESC)
    WHERE status='FAILED';

-- Historical runs never had enough structured information to make a safe
-- automatic retry decision.  Surface them for review instead of guessing.
INSERT INTO catalog_import_failure_queue (import_run_id,state,failure_code,last_error_summary)
SELECT id,'quarantined','legacy_unclassified',error_summary
FROM catalog_import_runs
WHERE status='FAILED' AND error_summary <> ''
ON CONFLICT (import_run_id) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS catalog_import_runs_failure_idx;
DROP INDEX IF EXISTS catalog_import_failure_queue_due_idx;
DROP TABLE IF EXISTS catalog_import_failure_queue;
ALTER TABLE catalog_import_runs
    DROP COLUMN IF EXISTS retry_after,
    DROP COLUMN IF EXISTS failure_retryable,
    DROP COLUMN IF EXISTS failure_code;
