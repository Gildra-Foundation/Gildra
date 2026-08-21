-- +goose Up
CREATE TABLE wowgg_tierlist_contexts (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('mythic_plus', 'raid', 'pvp')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank', 'dungeon_ease')),
    addon_id TEXT NOT NULL,
    addon_key TEXT NOT NULL,
    addon_name TEXT NOT NULL,
    selection_type TEXT NOT NULL CHECK (selection_type IN ('all', 'dungeon', 'raid', 'boss', 'bracket')),
    selection_id TEXT NOT NULL,
    selection_name TEXT NOT NULL,
    key_type TEXT NOT NULL DEFAULT '',
    raid_difficulty TEXT NOT NULL DEFAULT '',
    pvp_bracket TEXT NOT NULL DEFAULT '',
    pvp_region TEXT NOT NULL DEFAULT '',
    source_week TEXT NOT NULL,
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://wow[.]gg/ru/meta/'),
    source_updated_at TIMESTAMPTZ NOT NULL,
    record_count SMALLINT NOT NULL CHECK (record_count >= 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, context_key)
);

CREATE INDEX wowgg_tierlist_contexts_browse_idx
    ON wowgg_tierlist_contexts (
        snapshot_id, mode, role, addon_key, key_type, raid_difficulty,
        pvp_bracket, pvp_region, selection_type, selection_id
    );

CREATE TABLE wowgg_tierlist_entries (
    snapshot_id UUID NOT NULL,
    context_key TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('specialization', 'dungeon')),
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_slug TEXT NOT NULL CHECK (entity_slug ~ '^[a-z0-9][a-z0-9-]*$'),
    rank SMALLINT NOT NULL CHECK (rank > 0),
    tier TEXT NOT NULL CHECK (tier ~ '^[A-DS]$'),
    tier_assignments JSONB NOT NULL CHECK (jsonb_typeof(tier_assignments) = 'object'),
    class_name TEXT,
    class_slug TEXT CHECK (class_slug IS NULL OR class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT,
    spec_slug TEXT CHECK (spec_slug IS NULL OR spec_slug ~ '^[a-z][a-z-]+$'),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank', 'dungeon_ease')),
    guide_url TEXT NOT NULL CHECK (guide_url = '' OR guide_url ~ '^https://wow[.]gg/ru/guides/'),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://wow[.]gg/ru/meta/'),
    meta_score NUMERIC,
    average_dps NUMERIC,
    average_hps NUMERIC,
    top_value NUMERIC,
    popularity NUMERIC CHECK (popularity IS NULL OR popularity >= 0),
    pvp_players INTEGER CHECK (pvp_players IS NULL OR pvp_players >= 0),
    pvp_average_rating NUMERIC,
    pvp_max_rating NUMERIC,
    pvp_min_rating NUMERIC,
    max_key SMALLINT CHECK (max_key IS NULL OR max_key >= 0),
    diff_rank SMALLINT,
    metric_values JSONB NOT NULL CHECK (jsonb_typeof(metric_values) = 'object'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, context_key, entity_type, entity_slug),
    FOREIGN KEY (snapshot_id, context_key)
        REFERENCES wowgg_tierlist_contexts(snapshot_id, context_key) ON DELETE CASCADE,
    CHECK (
        (entity_type = 'specialization' AND class_name IS NOT NULL AND class_slug IS NOT NULL
            AND spec_name IS NOT NULL AND spec_slug IS NOT NULL)
        OR
        (entity_type = 'dungeon' AND class_name IS NULL AND class_slug IS NULL
            AND spec_name IS NULL AND spec_slug IS NULL)
    )
);

CREATE INDEX wowgg_tierlist_entries_browse_idx
    ON wowgg_tierlist_entries (snapshot_id, context_key, tier, rank);

CREATE INDEX wowgg_tierlist_entries_spec_history_idx
    ON wowgg_tierlist_entries (class_slug, spec_slug, snapshot_id)
    WHERE entity_type = 'specialization';

-- +goose Down
DROP TABLE IF EXISTS wowgg_tierlist_entries;
DROP TABLE IF EXISTS wowgg_tierlist_contexts;
