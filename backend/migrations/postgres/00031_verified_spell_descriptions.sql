-- +goose Up
CREATE TABLE catalog_verified_spell_descriptions (
    spell_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source TEXT NOT NULL CHECK (source IN ('wowhead_tooltip', 'blizzard_api')),
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL CHECK (description <> ''),
    source_url TEXT NOT NULL,
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (spell_version_id, locale, source)
);
CREATE INDEX catalog_verified_spell_descriptions_source_idx
    ON catalog_verified_spell_descriptions (source, fetched_at, spell_version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_verified_spell_descriptions;
