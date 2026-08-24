-- +goose Up
CREATE TABLE catalog_creatures (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    classification_id INTEGER NOT NULL DEFAULT 0,
    creature_type_id INTEGER NOT NULL DEFAULT 0,
    creature_family_id INTEGER NOT NULL DEFAULT 0,
    start_animation_state_id INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX catalog_creatures_type_family_idx
    ON catalog_creatures (creature_type_id, creature_family_id, classification_id, version_id);

CREATE TABLE catalog_creature_displays (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 3),
    display_external_id INTEGER NOT NULL CHECK (display_external_id > 0),
    probability REAL NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 1),
    PRIMARY KEY (version_id, slot)
);

CREATE INDEX catalog_creature_displays_external_idx
    ON catalog_creature_displays (display_external_id, version_id);

CREATE TABLE catalog_creature_display_info (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL CHECK (external_id > 0),
    model_external_id INTEGER NOT NULL CHECK (model_external_id > 0),
    portrait_file_data_id BIGINT CHECK (portrait_file_data_id IS NULL OR portrait_file_data_id > 0),
    texture_file_data_id BIGINT CHECK (texture_file_data_id IS NULL OR texture_file_data_id > 0),
    scale REAL NOT NULL DEFAULT 1 CHECK (scale > 0),
    alpha INTEGER NOT NULL DEFAULT 255 CHECK (alpha BETWEEN 0 AND 255),
    gender SMALLINT,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, external_id)
);

CREATE INDEX catalog_creature_display_info_model_idx
    ON catalog_creature_display_info (build_id, model_external_id, external_id);

CREATE TABLE catalog_creature_models (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL CHECK (external_id > 0),
    file_data_id BIGINT NOT NULL CHECK (file_data_id > 0),
    flags BIGINT NOT NULL DEFAULT 0,
    walk_speed REAL,
    run_speed REAL,
    collision_width REAL,
    collision_height REAL,
    model_scale REAL,
    PRIMARY KEY (build_id, external_id)
);

CREATE INDEX catalog_creature_models_file_idx
    ON catalog_creature_models (file_data_id, build_id, external_id);

CREATE TABLE catalog_creature_taxa (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    taxon_type TEXT NOT NULL CHECK (taxon_type IN ('type', 'family')),
    external_id INTEGER NOT NULL CHECK (external_id > 0),
    icon_file_data_id BIGINT CHECK (icon_file_data_id IS NULL OR icon_file_data_id > 0),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id, taxon_type, external_id)
);

CREATE TABLE catalog_creature_taxon_localizations (
    build_id BIGINT NOT NULL,
    taxon_type TEXT NOT NULL,
    external_id INTEGER NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    PRIMARY KEY (build_id, taxon_type, external_id, locale),
    FOREIGN KEY (build_id, taxon_type, external_id)
        REFERENCES catalog_creature_taxa(build_id, taxon_type, external_id) ON DELETE CASCADE
);

CREATE INDEX catalog_creature_taxon_localizations_locale_idx
    ON catalog_creature_taxon_localizations (locale, name, taxon_type, external_id);

CREATE TABLE catalog_creature_difficulties (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    difficulty_row_id BIGINT NOT NULL CHECK (difficulty_row_id > 0),
    faction_template_id INTEGER NOT NULL DEFAULT 0,
    content_tuning_id INTEGER NOT NULL DEFAULT 0,
    flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (version_id, difficulty_row_id)
);

-- Roles are populated later from vendor, trainer, quest, transport, and gossip sources.
CREATE TABLE catalog_npc_roles (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('vendor','trainer','quest_giver','quest_end','repair','flight_master','innkeeper','banker','auctioneer','transmogrifier','stable_master','gossip','transport','other')),
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (version_id, role, source)
);

CREATE INDEX catalog_npc_roles_role_idx ON catalog_npc_roles (role, version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_npc_roles;
DROP TABLE IF EXISTS catalog_creature_difficulties;
DROP TABLE IF EXISTS catalog_creature_taxon_localizations;
DROP TABLE IF EXISTS catalog_creature_taxa;
DROP TABLE IF EXISTS catalog_creature_models;
DROP TABLE IF EXISTS catalog_creature_display_info;
DROP TABLE IF EXISTS catalog_creature_displays;
DROP TABLE IF EXISTS catalog_creatures;
