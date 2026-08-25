-- +goose Up
CREATE TABLE catalog_verified_tooltips (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source TEXT NOT NULL CHECK (source IN ('wowhead_tooltip', 'blizzard_api')),
    variant_key TEXT NOT NULL DEFAULT 'base',
    source_url TEXT NOT NULL,
    raw_html TEXT NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, locale, source, variant_key)
);
CREATE INDEX catalog_verified_tooltips_source_fetched_idx
    ON catalog_verified_tooltips (source, fetched_at, version_id);

CREATE TABLE catalog_verified_item_details (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source TEXT NOT NULL CHECK (source IN ('wowhead_tooltip', 'blizzard_api')),
    variant_key TEXT NOT NULL DEFAULT 'base',
    item_level INTEGER CHECK (item_level IS NULL OR item_level >= 0),
    damage_min NUMERIC,
    damage_max NUMERIC,
    weapon_speed NUMERIC,
    damage_per_second NUMERIC,
    armor INTEGER CHECK (armor IS NULL OR armor >= 0),
    durability_current INTEGER CHECK (durability_current IS NULL OR durability_current >= 0),
    durability_max INTEGER CHECK (durability_max IS NULL OR durability_max >= 0),
    PRIMARY KEY (version_id, locale, source, variant_key)
);

CREATE TABLE catalog_verified_item_stats (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source TEXT NOT NULL CHECK (source IN ('wowhead_tooltip', 'blizzard_api')),
    variant_key TEXT NOT NULL DEFAULT 'base',
    stat_key TEXT NOT NULL,
    stat_label TEXT NOT NULL CHECK (stat_label <> ''),
    value NUMERIC NOT NULL,
    PRIMARY KEY (version_id, locale, source, variant_key, stat_key)
);
CREATE INDEX catalog_verified_item_stats_key_idx
    ON catalog_verified_item_stats (stat_key, value, version_id);

CREATE TABLE catalog_verified_item_drops (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source TEXT NOT NULL CHECK (source IN ('wowhead_tooltip', 'blizzard_api')),
    variant_key TEXT NOT NULL DEFAULT 'base',
    drop_source_name TEXT NOT NULL CHECK (drop_source_name <> ''),
    chance_percent NUMERIC CHECK (chance_percent IS NULL OR chance_percent BETWEEN 0 AND 100),
    source_url TEXT NOT NULL,
    PRIMARY KEY (version_id, locale, source, variant_key, drop_source_name)
);
CREATE INDEX catalog_verified_item_drops_name_idx
    ON catalog_verified_item_drops (drop_source_name, version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_verified_item_drops;
DROP TABLE IF EXISTS catalog_verified_item_stats;
DROP TABLE IF EXISTS catalog_verified_item_details;
DROP TABLE IF EXISTS catalog_verified_tooltips;
