-- +goose Up
CREATE TABLE catalog_fact_projection_runs (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES catalog_snapshots(id) ON DELETE RESTRICT,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE RESTRICT,
    source TEXT NOT NULL CHECK (btrim(source) <> ''),
    projection_key TEXT NOT NULL CHECK (projection_key ~ '^[a-z][a-z0-9_]{1,63}$'),
    status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
    evidence_total BIGINT NOT NULL DEFAULT 0 CHECK (evidence_total >= 0),
    table_count BIGINT NOT NULL DEFAULT 0 CHECK (table_count >= 0),
    row_count BIGINT NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    owner_unresolved BIGINT NOT NULL DEFAULT 0 CHECK (owner_unresolved >= 0),
    entity_source_missing BIGINT NOT NULL DEFAULT 0 CHECK (entity_source_missing >= 0),
    evidence_not_usable BIGINT NOT NULL DEFAULT 0 CHECK (evidence_not_usable >= 0),
    error_summary TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (finished_at >= started_at),
    CHECK ((status = 'succeeded' AND error_summary = '') OR
           (status = 'failed' AND btrim(error_summary) <> ''))
);

CREATE INDEX catalog_fact_projection_runs_recent_idx
    ON catalog_fact_projection_runs (projection_key, build_id, finished_at DESC, id DESC);
CREATE INDEX catalog_fact_projection_runs_snapshot_idx
    ON catalog_fact_projection_runs (snapshot_id, projection_key, id DESC);

-- +goose Down
DROP TABLE IF EXISTS catalog_fact_projection_runs;
