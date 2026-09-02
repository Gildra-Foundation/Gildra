-- +goose Up
-- League of Legends is isolated from the Warcraft and Genshin catalogs. A
-- complete Data Dragon import is written into a staging release and only
-- becomes visible after validation and an atomic publish.
CREATE TABLE lol_catalog_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ddragon_version TEXT NOT NULL CHECK (ddragon_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
    status TEXT NOT NULL DEFAULT 'staging'
        CHECK (status IN ('staging', 'validating', 'published', 'failed', 'superseded')),
    source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    entity_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE UNIQUE INDEX lol_one_published_release_idx
    ON lol_catalog_releases ((status))
    WHERE status = 'published';

CREATE INDEX lol_catalog_releases_created_idx
    ON lol_catalog_releases (created_at DESC);

CREATE TABLE lol_media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key TEXT NOT NULL UNIQUE CHECK (storage_key ~ '^lol/[0-9a-f]{64}[.](png|jpg|webp)$'),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://ddragon[.]leagueoflegends[.]com/'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sha256, mime_type)
);

CREATE TABLE lol_champions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES lol_catalog_releases(id) ON DELETE CASCADE,
    riot_key INTEGER NOT NULL CHECK (riot_key > 0),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    internal_name TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    info JSONB NOT NULL DEFAULT '{}'::jsonb,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    icon_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    splash_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    loading_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    tile_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, riot_key),
    UNIQUE (release_id, slug),
    UNIQUE (release_id, internal_name)
);

CREATE INDEX lol_champions_browse_idx
    ON lol_champions (release_id, slug, riot_key);

CREATE INDEX lol_champions_tags_idx
    ON lol_champions USING GIN (tags);

CREATE TABLE lol_champion_localizations (
    champion_id BIGINT NOT NULL REFERENCES lol_champions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    blurb TEXT NOT NULL DEFAULT '',
    lore TEXT NOT NULL DEFAULT '',
    ally_tips TEXT[] NOT NULL DEFAULT '{}',
    enemy_tips TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (champion_id, locale)
);

CREATE INDEX lol_champion_localizations_name_idx
    ON lol_champion_localizations (locale, lower(name));

CREATE TABLE lol_champion_abilities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    champion_id BIGINT NOT NULL REFERENCES lol_champions(id) ON DELETE CASCADE,
    ability_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('passive', 'spell')),
    slot TEXT NOT NULL CHECK (slot IN ('P', 'Q', 'W', 'E', 'R', 'EXTRA')),
    display_order SMALLINT NOT NULL CHECK (display_order >= 0),
    cooldowns JSONB NOT NULL DEFAULT '[]'::jsonb,
    costs JSONB NOT NULL DEFAULT '[]'::jsonb,
    ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    effects JSONB NOT NULL DEFAULT '[]'::jsonb,
    icon_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (champion_id, ability_key, display_order)
);

CREATE INDEX lol_champion_abilities_order_idx
    ON lol_champion_abilities (champion_id, display_order, id);

CREATE TABLE lol_champion_ability_localizations (
    ability_id BIGINT NOT NULL REFERENCES lol_champion_abilities(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tooltip TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (ability_id, locale)
);

CREATE TABLE lol_champion_skins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    champion_id BIGINT NOT NULL REFERENCES lol_champions(id) ON DELETE CASCADE,
    riot_skin_id BIGINT NOT NULL CHECK (riot_skin_id >= 0),
    skin_number INTEGER NOT NULL CHECK (skin_number >= 0),
    has_chromas BOOLEAN NOT NULL DEFAULT false,
    splash_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    loading_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    tile_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (champion_id, riot_skin_id),
    UNIQUE (champion_id, skin_number)
);

CREATE INDEX lol_champion_skins_order_idx
    ON lol_champion_skins (champion_id, skin_number);

CREATE TABLE lol_champion_skin_localizations (
    skin_id BIGINT NOT NULL REFERENCES lol_champion_skins(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    PRIMARY KEY (skin_id, locale)
);

-- Source-preserving entries retain the complete localized Data Dragon JSON
-- for every non-champion category while still offering a fast common index.
CREATE TABLE lol_static_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES lol_catalog_releases(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('items', 'runes', 'summoner-spells', 'maps', 'profile-icons')),
    external_key TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    icon_asset_id UUID REFERENCES lol_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, category, external_key)
);

CREATE INDEX lol_static_entries_browse_idx
    ON lol_static_entries (release_id, category, external_key);

CREATE INDEX lol_static_entries_tags_idx
    ON lol_static_entries USING GIN (tags);

CREATE TABLE lol_static_entry_localizations (
    entry_id BIGINT NOT NULL REFERENCES lol_static_entries(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (entry_id, locale)
);

CREATE INDEX lol_static_entry_localizations_name_idx
    ON lol_static_entry_localizations (locale, lower(name));

CREATE VIEW lol_current_release AS
SELECT id, ddragon_version, source_manifest, entity_counts, published_at
FROM lol_catalog_releases
WHERE status = 'published';

-- +goose Down
DROP VIEW IF EXISTS lol_current_release;
DROP TABLE IF EXISTS lol_static_entry_localizations;
DROP TABLE IF EXISTS lol_static_entries;
DROP TABLE IF EXISTS lol_champion_skin_localizations;
DROP TABLE IF EXISTS lol_champion_skins;
DROP TABLE IF EXISTS lol_champion_ability_localizations;
DROP TABLE IF EXISTS lol_champion_abilities;
DROP TABLE IF EXISTS lol_champion_localizations;
DROP TABLE IF EXISTS lol_champions;
DROP TABLE IF EXISTS lol_media_assets;
DROP TABLE IF EXISTS lol_catalog_releases;
