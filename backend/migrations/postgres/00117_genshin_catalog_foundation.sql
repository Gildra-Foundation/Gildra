-- +goose Up
-- Genshin Impact is intentionally isolated from the World of Warcraft
-- catalog. Imports are written into a release and only become visible after
-- that release is marked published.
CREATE TABLE genshin_catalog_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_revision TEXT NOT NULL,
    game_version TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'staging'
        CHECK (status IN ('staging', 'validating', 'published', 'failed', 'superseded')),
    source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    entity_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    CHECK ((status = 'published') = (published_at IS NOT NULL))
);

CREATE UNIQUE INDEX genshin_one_published_release_idx
    ON genshin_catalog_releases ((status))
    WHERE status = 'published';

CREATE INDEX genshin_catalog_releases_created_idx
    ON genshin_catalog_releases (created_at DESC);

CREATE TABLE genshin_media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    source_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sha256, mime_type)
);

CREATE TABLE genshin_characters (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES genshin_catalog_releases(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    rarity SMALLINT NOT NULL CHECK (rarity BETWEEN 4 AND 5),
    element TEXT NOT NULL CHECK (element IN ('anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo')),
    weapon_type TEXT NOT NULL CHECK (weapon_type IN ('sword', 'claymore', 'polearm', 'bow', 'catalyst')),
    region TEXT NOT NULL DEFAULT '',
    body_type TEXT NOT NULL DEFAULT '',
    birthday_month SMALLINT CHECK (birthday_month BETWEEN 1 AND 12),
    birthday_day SMALLINT CHECK (birthday_day BETWEEN 1 AND 31),
    release_date DATE,
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    portrait_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, external_id),
    UNIQUE (release_id, slug)
);

CREATE INDEX genshin_characters_filter_idx
    ON genshin_characters (release_id, element, weapon_type, rarity, slug);

CREATE TABLE genshin_character_localizations (
    character_id BIGINT NOT NULL REFERENCES genshin_characters(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (character_id, locale)
);

CREATE INDEX genshin_character_localizations_name_idx
    ON genshin_character_localizations (locale, lower(name));

CREATE TABLE genshin_character_talents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES genshin_characters(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('normal_attack', 'elemental_skill', 'elemental_burst', 'alternate_sprint', 'passive')),
    display_order SMALLINT NOT NULL DEFAULT 0,
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    scaling JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (character_id, external_key)
);

CREATE INDEX genshin_character_talents_order_idx
    ON genshin_character_talents (character_id, display_order, id);

CREATE TABLE genshin_character_talent_localizations (
    talent_id BIGINT NOT NULL REFERENCES genshin_character_talents(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (talent_id, locale)
);

CREATE TABLE genshin_character_constellations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES genshin_characters(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL,
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 6),
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (character_id, external_key),
    UNIQUE (character_id, position)
);

CREATE TABLE genshin_character_constellation_localizations (
    constellation_id BIGINT NOT NULL REFERENCES genshin_character_constellations(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (constellation_id, locale)
);

CREATE TABLE genshin_weapons (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES genshin_catalog_releases(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    rarity SMALLINT NOT NULL CHECK (rarity BETWEEN 1 AND 5),
    weapon_type TEXT NOT NULL CHECK (weapon_type IN ('sword', 'claymore', 'polearm', 'bow', 'catalyst')),
    base_attack NUMERIC(10,3),
    secondary_stat TEXT NOT NULL DEFAULT '',
    secondary_stat_value NUMERIC(12,5),
    release_date DATE,
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, external_id),
    UNIQUE (release_id, slug)
);

CREATE INDEX genshin_weapons_filter_idx
    ON genshin_weapons (release_id, weapon_type, rarity, slug);

CREATE TABLE genshin_weapon_localizations (
    weapon_id BIGINT NOT NULL REFERENCES genshin_weapons(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    passive_name TEXT NOT NULL DEFAULT '',
    passive_description TEXT NOT NULL DEFAULT '',
    refinement_descriptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (weapon_id, locale)
);

CREATE INDEX genshin_weapon_localizations_name_idx
    ON genshin_weapon_localizations (locale, lower(name));

CREATE TABLE genshin_weapon_level_stats (
    weapon_id BIGINT NOT NULL REFERENCES genshin_weapons(id) ON DELETE CASCADE,
    level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 90),
    ascension SMALLINT NOT NULL CHECK (ascension BETWEEN 0 AND 6),
    attack NUMERIC(10,3) NOT NULL CHECK (attack >= 0),
    secondary_stat_value NUMERIC(12,5),
    PRIMARY KEY (weapon_id, level, ascension)
);

CREATE TABLE genshin_artifact_sets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    release_id UUID NOT NULL REFERENCES genshin_catalog_releases(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    min_rarity SMALLINT NOT NULL CHECK (min_rarity BETWEEN 1 AND 5),
    max_rarity SMALLINT NOT NULL CHECK (max_rarity BETWEEN min_rarity AND 5),
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (release_id, external_id),
    UNIQUE (release_id, slug)
);

CREATE INDEX genshin_artifact_sets_filter_idx
    ON genshin_artifact_sets (release_id, max_rarity, slug);

CREATE TABLE genshin_artifact_set_localizations (
    artifact_set_id BIGINT NOT NULL REFERENCES genshin_artifact_sets(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    two_piece_bonus TEXT NOT NULL DEFAULT '',
    four_piece_bonus TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (artifact_set_id, locale)
);

CREATE INDEX genshin_artifact_set_localizations_name_idx
    ON genshin_artifact_set_localizations (locale, lower(name));

CREATE TABLE genshin_artifact_pieces (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    artifact_set_id BIGINT NOT NULL REFERENCES genshin_artifact_sets(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK (slot IN ('flower', 'plume', 'sands', 'goblet', 'circlet')),
    icon_asset_id UUID REFERENCES genshin_media_assets(id) ON DELETE SET NULL,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (artifact_set_id, slot)
);

CREATE TABLE genshin_artifact_piece_localizations (
    artifact_piece_id BIGINT NOT NULL REFERENCES genshin_artifact_pieces(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (artifact_piece_id, locale)
);

CREATE VIEW genshin_current_release AS
SELECT id, source_revision, game_version, entity_counts, published_at
FROM genshin_catalog_releases
WHERE status = 'published';

-- +goose Down
DROP VIEW IF EXISTS genshin_current_release;
DROP TABLE IF EXISTS genshin_artifact_piece_localizations;
DROP TABLE IF EXISTS genshin_artifact_pieces;
DROP TABLE IF EXISTS genshin_artifact_set_localizations;
DROP TABLE IF EXISTS genshin_artifact_sets;
DROP TABLE IF EXISTS genshin_weapon_level_stats;
DROP TABLE IF EXISTS genshin_weapon_localizations;
DROP TABLE IF EXISTS genshin_weapons;
DROP TABLE IF EXISTS genshin_character_constellation_localizations;
DROP TABLE IF EXISTS genshin_character_constellations;
DROP TABLE IF EXISTS genshin_character_talent_localizations;
DROP TABLE IF EXISTS genshin_character_talents;
DROP TABLE IF EXISTS genshin_character_localizations;
DROP TABLE IF EXISTS genshin_characters;
DROP TABLE IF EXISTS genshin_media_assets;
DROP TABLE IF EXISTS genshin_catalog_releases;
