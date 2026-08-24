-- +goose Up
-- Publication is fail-closed: a reviewed source policy is necessary, but an
-- explicit environment/surface grant is also required before data can leave
-- the private catalog store.
CREATE TABLE catalog_publication_grants (
    source TEXT NOT NULL REFERENCES catalog_source_policies(source) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
    surface TEXT NOT NULL CHECK (surface IN ('website','public_api','bulk_export','asset_cache')),
    decision TEXT NOT NULL DEFAULT 'blocked' CHECK (decision IN ('allowed','blocked')),
    scope JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    approved_by TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, environment, surface),
    CHECK (expires_at IS NULL OR reviewed_at IS NULL OR expires_at > reviewed_at),
    CHECK (decision = 'blocked' OR (btrim(approved_by) <> '' AND reviewed_at IS NOT NULL))
);

CREATE INDEX catalog_publication_grants_active_idx
    ON catalog_publication_grants (environment, surface, source)
    WHERE decision = 'allowed';

CREATE TABLE catalog_pipeline_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pipeline_key TEXT NOT NULL CHECK (pipeline_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','schedule','retry')),
    mode TEXT NOT NULL CHECK (mode IN ('dry_run','apply')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
    product TEXT NOT NULL CHECK (product ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
    requested_sources TEXT[] NOT NULL DEFAULT '{}',
    build_version TEXT NOT NULL DEFAULT '',
    current_stage TEXT NOT NULL DEFAULT '',
    counters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counters) = 'object'),
    publication_environment TEXT NOT NULL
        CHECK (publication_environment IN ('development','staging','production')),
    publication_ready BOOLEAN,
    read_model_generation_before BIGINT CHECK (read_model_generation_before IS NULL OR read_model_generation_before >= 0),
    read_model_generation_after BIGINT CHECK (read_model_generation_after IS NULL OR read_model_generation_after >= 0),
    error_code TEXT NOT NULL DEFAULT '',
    error_summary TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX catalog_pipeline_runs_recent_idx
    ON catalog_pipeline_runs (pipeline_key, created_at DESC, id DESC);
CREATE INDEX catalog_pipeline_runs_active_idx
    ON catalog_pipeline_runs (created_at, id)
    WHERE status IN ('queued','running');
CREATE INDEX catalog_pipeline_runs_failed_idx
    ON catalog_pipeline_runs (created_at DESC, id DESC)
    WHERE status IN ('failed','blocked');

CREATE TABLE catalog_pipeline_stages (
    run_id BIGINT NOT NULL REFERENCES catalog_pipeline_runs(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL CHECK (stage_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    ordinal SMALLINT NOT NULL CHECK (ordinal > 0),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','succeeded','failed','blocked','skipped')),
    executable TEXT NOT NULL DEFAULT '',
    safe_arguments TEXT[] NOT NULL DEFAULT '{}',
    counters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counters) = 'object'),
    error_code TEXT NOT NULL DEFAULT '',
    error_summary TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    PRIMARY KEY (run_id, stage_key),
    UNIQUE (run_id, ordinal),
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX catalog_pipeline_stages_status_idx
    ON catalog_pipeline_stages (status, run_id, ordinal)
    WHERE status IN ('queued','running','failed','blocked');

-- Seed only explicit denials. There are deliberately no production allows.
INSERT INTO catalog_publication_grants(source,environment,surface,decision,reason)
SELECT source, environment, surface, 'blocked', 'Fail-closed until a current source review and explicit owner approval exist.'
FROM catalog_source_policies
CROSS JOIN (VALUES ('development'),('staging'),('production')) AS environments(environment)
CROSS JOIN (VALUES ('public_api'),('bulk_export')) AS surfaces(surface)
ON CONFLICT (source,environment,surface) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS catalog_pipeline_stages;
DROP TABLE IF EXISTS catalog_pipeline_runs;
DROP TABLE IF EXISTS catalog_publication_grants;
