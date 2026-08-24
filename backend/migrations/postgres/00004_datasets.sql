-- +goose Up
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
    name TEXT NOT NULL,
    source_name TEXT NOT NULL,
    refresh_interval INTERVAL NOT NULL DEFAULT INTERVAL '1 day'
        CHECK (refresh_interval >= INTERVAL '1 hour'),
    current_snapshot_id UUID,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_code TEXT NOT NULL DEFAULT '',
    last_error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dataset_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id),
    run_key TEXT NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'retry', 'seed')),
    scheduled_for DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
    attempt_count SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    page_count SMALLINT NOT NULL DEFAULT 0 CHECK (page_count >= 0),
    record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    unique_spec_count SMALLINT NOT NULL DEFAULT 0 CHECK (unique_spec_count >= 0),
    credits_spent NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (credits_spent >= 0),
    snapshot_id UUID,
    lkg_snapshot_id UUID,
    error_code TEXT NOT NULL DEFAULT '',
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dataset_id, run_key)
);

CREATE INDEX dataset_runs_history_idx
    ON dataset_runs (dataset_id, scheduled_for DESC, created_at DESC);

CREATE INDEX dataset_runs_failures_idx
    ON dataset_runs (dataset_id, finished_at DESC)
    WHERE status = 'failed';

CREATE TABLE dataset_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id),
    run_id UUID NOT NULL UNIQUE REFERENCES dataset_runs(id),
    source_fetched_at TIMESTAMPTZ NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    page_count SMALLINT NOT NULL CHECK (page_count > 0),
    record_count INTEGER NOT NULL CHECK (record_count > 0),
    unique_spec_count SMALLINT NOT NULL CHECK (unique_spec_count > 0),
    payload JSONB NOT NULL,
    validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dataset_id, id)
);

CREATE INDEX dataset_snapshots_history_idx
    ON dataset_snapshots (dataset_id, source_fetched_at DESC, created_at DESC);

ALTER TABLE datasets
    ADD CONSTRAINT datasets_current_snapshot_fk
    FOREIGN KEY (id, current_snapshot_id)
    REFERENCES dataset_snapshots(dataset_id, id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE dataset_runs
    ADD CONSTRAINT dataset_runs_snapshot_fk
    FOREIGN KEY (dataset_id, snapshot_id)
    REFERENCES dataset_snapshots(dataset_id, id)
    DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT dataset_runs_lkg_snapshot_fk
    FOREIGN KEY (dataset_id, lkg_snapshot_id)
    REFERENCES dataset_snapshots(dataset_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE tierlist_entries (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    activity TEXT NOT NULL CHECK (activity IN ('raid', 'mythic_plus')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank')),
    tier TEXT NOT NULL CHECK (tier ~ '^[A-FS][+]?$'),
    rank_in_tier SMALLINT NOT NULL CHECK (rank_in_tier > 0),
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    badge_slug TEXT NOT NULL,
    guide_id BIGINT NOT NULL CHECK (guide_id > 0),
    guide_title TEXT NOT NULL DEFAULT '',
    guide_url TEXT NOT NULL CHECK (guide_url ~ '^https://www[.]wowhead[.]com/guide/classes/'),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://www[.]wowhead[.]com/guide/classes/tier-lists/'),
    description TEXT NOT NULL CHECK (length(description) >= 100),
    description_paragraphs TEXT[] NOT NULL CHECK (cardinality(description_paragraphs) > 0),
    description_markup TEXT NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, activity, role, class_slug, spec_slug),
    UNIQUE (snapshot_id, activity, role, guide_id)
);

CREATE INDEX tierlist_entries_browse_idx
    ON tierlist_entries (snapshot_id, activity, role, tier, rank_in_tier);

CREATE INDEX tierlist_entries_spec_history_idx
    ON tierlist_entries (class_slug, spec_slug, snapshot_id);

-- +goose Down
ALTER TABLE datasets DROP CONSTRAINT IF EXISTS datasets_current_snapshot_fk;
ALTER TABLE dataset_runs DROP CONSTRAINT IF EXISTS dataset_runs_snapshot_fk;
ALTER TABLE dataset_runs DROP CONSTRAINT IF EXISTS dataset_runs_lkg_snapshot_fk;
DROP TABLE IF EXISTS tierlist_entries;
DROP TABLE IF EXISTS dataset_snapshots;
DROP TABLE IF EXISTS dataset_runs;
DROP TABLE IF EXISTS datasets;
