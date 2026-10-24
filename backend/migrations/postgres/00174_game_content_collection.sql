-- +goose Up
-- Collection owns separate tables and has no publication pointer or approval
-- capability. Raw public JSON is small enough to retain privately in PostgreSQL.
CREATE TABLE gc_collection_targets (
    target_key TEXT PRIMARY KEY,
    context JSONB NOT NULL CHECK (jsonb_typeof(context) = 'object'),
    module_id TEXT NOT NULL CHECK (module_id IN ('raids', 'mythic-plus')),
    mode TEXT NOT NULL DEFAULT 'collect_only' CHECK (mode = 'collect_only'),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE gc_collection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_key TEXT NOT NULL REFERENCES gc_collection_targets(target_key),
    run_key TEXT NOT NULL CHECK (length(run_key) BETWEEN 1 AND 200),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','candidate_ready','no_change','failed')),
    attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
    fence BIGINT NOT NULL DEFAULT 1 CHECK (fence > 0),
    base_generation BIGINT NOT NULL DEFAULT 0,
    facts_hash TEXT,
    error_code TEXT,
    retryable BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    UNIQUE (target_key,run_key)
);
CREATE TABLE gc_source_cooldowns (
    source_id TEXT PRIMARY KEY,
    not_before TIMESTAMPTZ NOT NULL
);
CREATE TABLE gc_source_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_key TEXT NOT NULL REFERENCES gc_collection_targets(target_key),
    request_key TEXT NOT NULL,
    source_id TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    source_url TEXT NOT NULL,
    namespace TEXT NOT NULL,
    locale TEXT NOT NULL,
    source_published_at TIMESTAMPTZ,
    first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_build TEXT,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    body BYTEA NOT NULL CHECK (octet_length(body) BETWEEN 2 AND 1048576),
    UNIQUE (target_key,request_key,sha256)
);
CREATE TABLE gc_collection_observations (
    run_id UUID NOT NULL REFERENCES gc_collection_runs(id),
    attempt INTEGER NOT NULL,
    artifact_id UUID NOT NULL REFERENCES gc_source_artifacts(id),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    http_status INTEGER NOT NULL CHECK (http_status IN (200,304)),
    etag TEXT NOT NULL DEFAULT '',
    last_modified TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (run_id,attempt)
);
CREATE TABLE gc_collection_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL UNIQUE REFERENCES gc_collection_runs(id),
    target_key TEXT NOT NULL REFERENCES gc_collection_targets(target_key),
    base_generation BIGINT NOT NULL,
    previous_facts_hash TEXT,
    facts_hash TEXT NOT NULL CHECK (facts_hash ~ '^[a-f0-9]{64}$'),
    facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
    diff JSONB NOT NULL CHECK (jsonb_typeof(diff) = 'object'),
    warnings JSONB NOT NULL CHECK (jsonb_typeof(warnings) = 'array'),
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status = 'pending_review'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gc_collection_history_idx ON gc_collection_runs(target_key,finished_at DESC);
CREATE INDEX gc_collection_candidates_idx ON gc_collection_candidates(target_key,created_at DESC);
CREATE TRIGGER gc_source_artifact_immutable BEFORE UPDATE OR DELETE ON gc_source_artifacts
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();
CREATE TRIGGER gc_collection_candidate_immutable BEFORE UPDATE OR DELETE ON gc_collection_candidates
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();

-- +goose Down
DROP TABLE gc_collection_candidates;
DROP TABLE gc_collection_observations;
DROP TABLE gc_source_artifacts;
DROP TABLE gc_collection_runs;
DROP TABLE gc_source_cooldowns;
DROP TABLE gc_collection_targets;
