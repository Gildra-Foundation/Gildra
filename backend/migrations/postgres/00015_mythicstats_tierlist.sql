-- +goose Up
CREATE TABLE mythicstats_pages (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL CHECK (context_key IN ('performance', 'spec_tiers')),
    page_type TEXT NOT NULL CHECK (page_type IN ('performance', 'spec_tiers')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://mythicstats[.]com/(dps|spec)$'),
    source_period_id TEXT NOT NULL DEFAULT '' CHECK (source_period_id = '' OR source_period_id ~ '^[0-9]+$'),
    source_period_name TEXT NOT NULL DEFAULT '',
    key_range TEXT NOT NULL DEFAULT '',
    record_count SMALLINT NOT NULL CHECK (record_count > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, context_key)
);

CREATE TABLE mythicstats_performance_entries (
    snapshot_id UUID NOT NULL,
    context_key TEXT NOT NULL DEFAULT 'performance' CHECK (context_key = 'performance'),
    role TEXT NOT NULL CHECK (role IN ('dps', 'tank', 'healer')),
    rank SMALLINT NOT NULL CHECK (rank > 0),
    rank_change SMALLINT NOT NULL DEFAULT 0,
    tier TEXT NOT NULL CHECK (tier ~ '^[SABCDF]$'),
    average_value BIGINT NOT NULL CHECK (average_value > 0),
    top_value BIGINT NOT NULL CHECK (top_value >= average_value),
    runs_label TEXT NOT NULL,
    runs_estimate INTEGER NOT NULL CHECK (runs_estimate > 0),
    key_range TEXT NOT NULL,
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    icon_url TEXT NOT NULL CHECK (icon_url ~ '^https://'),
    spec_url TEXT NOT NULL CHECK (spec_url ~ '^https://mythicstats[.]com/spec/'),
    source_url TEXT NOT NULL CHECK (source_url = 'https://mythicstats.com/dps'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, role, class_slug, spec_slug),
    UNIQUE (snapshot_id, role, rank),
    FOREIGN KEY (snapshot_id, context_key)
        REFERENCES mythicstats_pages(snapshot_id, context_key) ON DELETE CASCADE
);

CREATE INDEX mythicstats_performance_browse_idx
    ON mythicstats_performance_entries (snapshot_id, role, rank);

CREATE INDEX mythicstats_performance_history_idx
    ON mythicstats_performance_entries (class_slug, spec_slug, snapshot_id);

CREATE TABLE mythicstats_spec_tier_entries (
    snapshot_id UUID NOT NULL,
    context_key TEXT NOT NULL DEFAULT 'spec_tiers' CHECK (context_key = 'spec_tiers'),
    category TEXT NOT NULL CHECK (category IN ('melee', 'ranged', 'tank', 'healer')),
    tier TEXT NOT NULL CHECK (tier ~ '^[SABCDF]$'),
    rank_in_tier SMALLINT NOT NULL CHECK (rank_in_tier > 0),
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    icon_url TEXT NOT NULL CHECK (icon_url ~ '^https://'),
    spec_url TEXT NOT NULL CHECK (spec_url ~ '^https://mythicstats[.]com/spec/'),
    source_url TEXT NOT NULL CHECK (source_url = 'https://mythicstats.com/spec'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, category, class_slug, spec_slug),
    UNIQUE (snapshot_id, category, tier, rank_in_tier),
    FOREIGN KEY (snapshot_id, context_key)
        REFERENCES mythicstats_pages(snapshot_id, context_key) ON DELETE CASCADE
);

CREATE INDEX mythicstats_spec_tier_browse_idx
    ON mythicstats_spec_tier_entries (snapshot_id, category, tier, rank_in_tier);

CREATE INDEX mythicstats_spec_tier_history_idx
    ON mythicstats_spec_tier_entries (class_slug, spec_slug, snapshot_id);

INSERT INTO datasets (slug, name, source_name, refresh_interval)
VALUES ('tierlist-mythicstats', 'Tierlist — MythicStats', 'mythicstats.com', INTERVAL '1 day')
ON CONFLICT (slug) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS mythicstats_spec_tier_entries;
DROP TABLE IF EXISTS mythicstats_performance_entries;
DROP TABLE IF EXISTS mythicstats_pages;

DELETE FROM datasets
WHERE slug = 'tierlist-mythicstats'
  AND current_snapshot_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dataset_runs WHERE dataset_runs.dataset_id = datasets.id
  );
