-- +goose Up
CREATE TABLE catalog_item_classes (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL CHECK (class_id >= 0),
    db2_row_id BIGINT NOT NULL,
    price_modifier NUMERIC,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, class_id),
    UNIQUE (build_id, db2_row_id)
);

CREATE TABLE catalog_item_class_localizations (
    build_id BIGINT NOT NULL,
    class_id INTEGER NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    PRIMARY KEY (build_id, class_id, locale),
    FOREIGN KEY (build_id, class_id)
        REFERENCES catalog_item_classes(build_id, class_id) ON DELETE CASCADE
);
CREATE INDEX catalog_item_class_localizations_locale_idx
    ON catalog_item_class_localizations (locale, name, class_id);

CREATE TABLE catalog_item_subclasses (
    build_id BIGINT NOT NULL,
    class_id INTEGER NOT NULL,
    subclass_id INTEGER NOT NULL CHECK (subclass_id >= 0),
    db2_row_id BIGINT NOT NULL,
    auction_house_sort_order INTEGER NOT NULL DEFAULT 0,
    prerequisite_proficiency INTEGER NOT NULL DEFAULT 0,
    postrequisite_proficiency INTEGER NOT NULL DEFAULT 0,
    flags BIGINT NOT NULL DEFAULT 0,
    display_flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, class_id, subclass_id),
    UNIQUE (build_id, db2_row_id),
    FOREIGN KEY (build_id, class_id)
        REFERENCES catalog_item_classes(build_id, class_id) ON DELETE CASCADE
);

CREATE TABLE catalog_item_subclass_localizations (
    build_id BIGINT NOT NULL,
    class_id INTEGER NOT NULL,
    subclass_id INTEGER NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    verbose_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (build_id, class_id, subclass_id, locale),
    FOREIGN KEY (build_id, class_id, subclass_id)
        REFERENCES catalog_item_subclasses(build_id, class_id, subclass_id) ON DELETE CASCADE
);
CREATE INDEX catalog_item_subclass_localizations_locale_idx
    ON catalog_item_subclass_localizations (locale, name, class_id, subclass_id);

CREATE TABLE catalog_item_stats (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 9),
    stat_type INTEGER NOT NULL,
    percent_editor NUMERIC NOT NULL DEFAULT 0,
    socket_percentage NUMERIC NOT NULL DEFAULT 0,
    PRIMARY KEY (version_id, slot)
);
CREATE INDEX catalog_item_stats_type_idx ON catalog_item_stats (stat_type, version_id);

CREATE TABLE catalog_item_sockets (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 2),
    socket_type INTEGER NOT NULL CHECK (socket_type > 0),
    PRIMARY KEY (version_id, slot)
);
CREATE INDEX catalog_item_sockets_type_idx ON catalog_item_sockets (socket_type, version_id);

CREATE TABLE catalog_item_requirements (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    required_level INTEGER NOT NULL DEFAULT 0 CHECK (required_level >= 0),
    required_skill_id INTEGER,
    required_skill_rank INTEGER NOT NULL DEFAULT 0 CHECK (required_skill_rank >= 0),
    required_ability_id BIGINT,
    min_faction_id INTEGER,
    min_reputation INTEGER NOT NULL DEFAULT 0,
    required_holiday_id INTEGER,
    required_transmog_holiday_id INTEGER,
    allowable_class_mask BIGINT NOT NULL DEFAULT 0,
    allowable_race_mask_0 BIGINT NOT NULL DEFAULT 0,
    allowable_race_mask_1 BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX catalog_item_requirements_skill_idx
    ON catalog_item_requirements (required_skill_id, required_skill_rank, version_id)
    WHERE required_skill_id IS NOT NULL;
CREATE INDEX catalog_item_requirements_ability_idx
    ON catalog_item_requirements (required_ability_id, version_id)
    WHERE required_ability_id IS NOT NULL;

CREATE TABLE catalog_item_effects (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    item_effect_id BIGINT NOT NULL,
    slot SMALLINT NOT NULL DEFAULT 0,
    spell_id BIGINT NOT NULL CHECK (spell_id > 0),
    trigger_type INTEGER NOT NULL DEFAULT 0,
    charges INTEGER NOT NULL DEFAULT 0,
    cooldown_ms INTEGER NOT NULL DEFAULT 0,
    category_cooldown_ms INTEGER NOT NULL DEFAULT 0,
    spell_category_id INTEGER NOT NULL DEFAULT 0,
    specialization_id INTEGER NOT NULL DEFAULT 0,
    player_condition_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (version_id, item_effect_id)
);
CREATE INDEX catalog_item_effects_spell_idx ON catalog_item_effects (spell_id, version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_item_effects;
DROP TABLE IF EXISTS catalog_item_requirements;
DROP TABLE IF EXISTS catalog_item_sockets;
DROP TABLE IF EXISTS catalog_item_stats;
DROP TABLE IF EXISTS catalog_item_subclass_localizations;
DROP TABLE IF EXISTS catalog_item_subclasses;
DROP TABLE IF EXISTS catalog_item_class_localizations;
DROP TABLE IF EXISTS catalog_item_classes;
