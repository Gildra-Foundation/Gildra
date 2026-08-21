-- +goose Up
CREATE TABLE icyveins_tierlist_pages (
    snapshot_id UUID NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    activity TEXT NOT NULL CHECK (activity IN ('mythic_plus', 'raid', 'pvp')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank')),
    title TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://www[.]icy-veins[.]com/wow/'),
    source_updated_at TIMESTAMPTZ NOT NULL,
    record_count SMALLINT NOT NULL CHECK (record_count > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, context_key)
);

CREATE INDEX icyveins_tierlist_pages_browse_idx
    ON icyveins_tierlist_pages (snapshot_id, activity, role);

CREATE TABLE icyveins_tierlist_entries (
    snapshot_id UUID NOT NULL,
    context_key TEXT NOT NULL,
    activity TEXT NOT NULL CHECK (activity IN ('mythic_plus', 'raid', 'pvp')),
    role TEXT NOT NULL CHECK (role IN ('dps', 'healer', 'tank')),
    tier TEXT NOT NULL CHECK (tier ~ '^[SABCD][+-]?$'),
    rank_in_tier SMALLINT NOT NULL CHECK (rank_in_tier > 0),
    class_name TEXT NOT NULL,
    class_slug TEXT NOT NULL CHECK (class_slug ~ '^[a-z][a-z-]+$'),
    spec_name TEXT NOT NULL,
    spec_slug TEXT NOT NULL CHECK (spec_slug ~ '^[a-z][a-z-]+$'),
    icon_url TEXT NOT NULL CHECK (icon_url ~ '^https://static[.]icy-veins[.]com/'),
    guide_url TEXT NOT NULL CHECK (guide_url ~ '^https://www[.]icy-veins[.]com/wow/'),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://www[.]icy-veins[.]com/wow/'),
    change_direction TEXT NOT NULL DEFAULT 'unknown'
        CHECK (change_direction IN ('up', 'down', 'same', 'unknown')),
    description TEXT NOT NULL,
    description_paragraphs TEXT[] NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, context_key, class_slug, spec_slug),
    FOREIGN KEY (snapshot_id, context_key)
        REFERENCES icyveins_tierlist_pages(snapshot_id, context_key) ON DELETE CASCADE
);

CREATE INDEX icyveins_tierlist_entries_browse_idx
    ON icyveins_tierlist_entries (snapshot_id, activity, role, tier, rank_in_tier);

CREATE INDEX icyveins_tierlist_entries_spec_history_idx
    ON icyveins_tierlist_entries (class_slug, spec_slug, snapshot_id);

-- +goose Down
DROP TABLE IF EXISTS icyveins_tierlist_entries;
DROP TABLE IF EXISTS icyveins_tierlist_pages;
