-- +goose Up
CREATE TABLE archon_tierlist_entries (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    activity TEXT NOT NULL CHECK (activity IN ('raid', 'mythic_plus')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('10', 'normal', 'heroic', 'mythic')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank')),
    rank SMALLINT NOT NULL CHECK (rank > 0),
    tier TEXT NOT NULL DEFAULT '' CHECK (tier = '' OR tier ~ '^[A-FS][+]?$'),
    tier_assignments JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(tier_assignments) = 'object'),
    spec_id BIGINT,
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    icon_slug TEXT NOT NULL,
    build_url TEXT NOT NULL CHECK (build_url ~ '^https://www[.]archon[.]gg/wow/builds/'),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://www[.]archon[.]gg/wow/tier-list/'),
    score NUMERIC,
    dps NUMERIC,
    hps NUMERIC,
    survivability NUMERIC CHECK (survivability IS NULL OR survivability BETWEEN 0 AND 100),
    popularity NUMERIC CHECK (popularity IS NULL OR popularity BETWEEN 0 AND 1),
    parses BIGINT NOT NULL CHECK (parses >= 0),
    max_key SMALLINT CHECK (max_key IS NULL OR max_key >= 0),
    source_updated_at TIMESTAMPTZ NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, activity, difficulty, role, class_slug, spec_slug)
);

CREATE INDEX archon_tierlist_entries_browse_idx
    ON archon_tierlist_entries (snapshot_id, activity, difficulty, role, tier, rank);

CREATE INDEX archon_tierlist_entries_spec_history_idx
    ON archon_tierlist_entries (class_slug, spec_slug, source_updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS archon_tierlist_entries;
