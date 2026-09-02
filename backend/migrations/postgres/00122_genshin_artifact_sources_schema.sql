-- +goose Up
-- Curated acquisition records fill the source categories that genshin-db
-- does not attach to an artifact set (world/weekly bosses and the Artifact
-- Strongbox). They are deliberately independent of a release UUID so that
-- a future catalog import cannot silently erase them.
CREATE TABLE genshin_artifact_acquisition_sources (
    artifact_slug TEXT NOT NULL CHECK (artifact_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    source_slug TEXT NOT NULL CHECK (source_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('world_boss', 'artifact_strongbox')),
    name TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    entrance_name TEXT NOT NULL DEFAULT '',
    unlock_rank SMALLINT NOT NULL DEFAULT 0 CHECK (unlock_rank >= 0),
    recommended_level SMALLINT NOT NULL DEFAULT 0 CHECK (recommended_level >= 0),
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (artifact_slug, locale, source_slug)
);

CREATE INDEX genshin_artifact_acquisition_sources_slug_idx
    ON genshin_artifact_acquisition_sources (artifact_slug, locale);

-- +goose Down
DROP TABLE IF EXISTS genshin_artifact_acquisition_sources;
