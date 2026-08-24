-- +goose Up
CREATE TABLE catalog_journal_instances (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    journal_instance_id BIGINT NOT NULL,
    map_id INTEGER,
    area_id INTEGER,
    covenant_id INTEGER,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, journal_instance_id)
);

CREATE TABLE catalog_journal_instance_localizations (
    build_id BIGINT NOT NULL,
    journal_instance_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (build_id, journal_instance_id, locale),
    FOREIGN KEY (build_id, journal_instance_id)
        REFERENCES catalog_journal_instances(build_id, journal_instance_id) ON DELETE CASCADE
);

CREATE TABLE catalog_journal_encounters (
    build_id BIGINT NOT NULL,
    journal_encounter_id BIGINT NOT NULL,
    journal_instance_id BIGINT NOT NULL,
    dungeon_encounter_id BIGINT,
    ui_map_id INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    difficulty_mask BIGINT NOT NULL DEFAULT 0,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, journal_encounter_id),
    FOREIGN KEY (build_id, journal_instance_id)
        REFERENCES catalog_journal_instances(build_id, journal_instance_id) ON DELETE CASCADE
);
CREATE INDEX catalog_journal_encounters_instance_idx
    ON catalog_journal_encounters (build_id, journal_instance_id, order_index);
CREATE INDEX catalog_journal_encounters_dungeon_idx
    ON catalog_journal_encounters (dungeon_encounter_id, journal_encounter_id)
    WHERE dungeon_encounter_id IS NOT NULL;

CREATE TABLE catalog_journal_encounter_localizations (
    build_id BIGINT NOT NULL,
    journal_encounter_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (build_id, journal_encounter_id, locale),
    FOREIGN KEY (build_id, journal_encounter_id)
        REFERENCES catalog_journal_encounters(build_id, journal_encounter_id) ON DELETE CASCADE
);

CREATE TABLE catalog_item_acquisition_sources (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('encounter', 'crafting_recipe', 'blizzard_api')),
    source_id BIGINT NOT NULL,
    context_id BIGINT NOT NULL DEFAULT 0,
    source_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    journal_instance_id BIGINT,
    difficulty_mask BIGINT NOT NULL DEFAULT 0,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (version_id, source_type, source_id, context_id)
);
CREATE INDEX catalog_item_acquisition_sources_source_idx
    ON catalog_item_acquisition_sources (source_type, source_id, version_id);
CREATE INDEX catalog_item_acquisition_sources_entity_idx
    ON catalog_item_acquisition_sources (source_entity_id, version_id)
    WHERE source_entity_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS catalog_item_acquisition_sources;
DROP TABLE IF EXISTS catalog_journal_encounter_localizations;
DROP TABLE IF EXISTS catalog_journal_encounters;
DROP TABLE IF EXISTS catalog_journal_instance_localizations;
DROP TABLE IF EXISTS catalog_journal_instances;
