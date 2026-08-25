-- +goose Up
CREATE TABLE catalog_quest_registry (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    quest_id BIGINT NOT NULL CHECK (quest_id > 0),
    unique_bit_flag BIGINT NOT NULL DEFAULT 0,
    ui_details_theme_id INTEGER,
    has_client_task BOOLEAN NOT NULL DEFAULT false,
    enrichment_status TEXT NOT NULL DEFAULT 'registry_only'
        CHECK (enrichment_status IN ('registry_only', 'client_task', 'blizzard_api')),
    PRIMARY KEY (build_id, quest_id)
);
CREATE INDEX catalog_quest_registry_status_idx
    ON catalog_quest_registry (build_id, enrichment_status, quest_id);

CREATE TABLE catalog_quest_localizations (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    title TEXT NOT NULL DEFAULT '',
    bullet_text TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL CHECK (source IN ('db2_client_task', 'blizzard_api')),
    PRIMARY KEY (build_id, quest_id, locale),
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE
);
CREATE INDEX catalog_quest_localizations_locale_title_idx
    ON catalog_quest_localizations (locale, title, quest_id);

CREATE TABLE catalog_quest_details (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    quest_info_id INTEGER,
    content_tuning_id INTEGER,
    covenant_id INTEGER,
    start_item_id BIGINT,
    breadcrumb_quest_id BIGINT,
    condition_id INTEGER,
    world_state_expression_id INTEGER,
    class_mask BIGINT NOT NULL DEFAULT 0,
    race_mask_0 BIGINT NOT NULL DEFAULT 0,
    race_mask_1 BIGINT NOT NULL DEFAULT 0,
    flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id, quest_id),
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE
);
CREATE INDEX catalog_quest_details_info_idx
    ON catalog_quest_details (build_id, quest_info_id, quest_id)
    WHERE quest_info_id IS NOT NULL;
CREATE INDEX catalog_quest_details_start_item_idx
    ON catalog_quest_details (start_item_id, quest_id)
    WHERE start_item_id IS NOT NULL;

CREATE TABLE catalog_quest_objectives (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    objective_id BIGINT NOT NULL,
    objective_type INTEGER NOT NULL,
    object_id BIGINT,
    amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    order_index INTEGER NOT NULL DEFAULT 0,
    storage_index INTEGER NOT NULL DEFAULT 0,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, quest_id, objective_id),
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE
);
CREATE INDEX catalog_quest_objectives_object_idx
    ON catalog_quest_objectives (objective_type, object_id, quest_id)
    WHERE object_id IS NOT NULL;

CREATE TABLE catalog_quest_objective_localizations (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    objective_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (build_id, quest_id, objective_id, locale),
    FOREIGN KEY (build_id, quest_id, objective_id)
        REFERENCES catalog_quest_objectives(build_id, quest_id, objective_id) ON DELETE CASCADE
);

CREATE TABLE catalog_quest_lines (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    quest_line_id BIGINT NOT NULL,
    completion_condition_id INTEGER,
    player_condition_id INTEGER,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, quest_line_id)
);

CREATE TABLE catalog_quest_line_localizations (
    build_id BIGINT NOT NULL,
    quest_line_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (build_id, quest_line_id, locale),
    FOREIGN KEY (build_id, quest_line_id)
        REFERENCES catalog_quest_lines(build_id, quest_line_id) ON DELETE CASCADE
);

CREATE TABLE catalog_quest_line_entries (
    build_id BIGINT NOT NULL,
    quest_line_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, quest_line_id, quest_id),
    FOREIGN KEY (build_id, quest_line_id)
        REFERENCES catalog_quest_lines(build_id, quest_line_id) ON DELETE CASCADE,
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE
);
CREATE INDEX catalog_quest_line_entries_quest_idx
    ON catalog_quest_line_entries (build_id, quest_id, quest_line_id);

CREATE TABLE catalog_quest_poi_blobs (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    blob_id BIGINT NOT NULL,
    map_id INTEGER,
    ui_map_id INTEGER,
    objective_id BIGINT,
    objective_index INTEGER NOT NULL DEFAULT 0,
    player_condition_id INTEGER,
    navigation_condition_id INTEGER,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, blob_id),
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE
);
CREATE INDEX catalog_quest_poi_blobs_quest_idx
    ON catalog_quest_poi_blobs (build_id, quest_id, objective_index);
CREATE INDEX catalog_quest_poi_blobs_map_idx
    ON catalog_quest_poi_blobs (build_id, ui_map_id, quest_id)
    WHERE ui_map_id IS NOT NULL;

CREATE TABLE catalog_quest_poi_points (
    build_id BIGINT NOT NULL,
    blob_id BIGINT NOT NULL,
    point_id BIGINT NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (build_id, blob_id, point_id),
    FOREIGN KEY (build_id, blob_id)
        REFERENCES catalog_quest_poi_blobs(build_id, blob_id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE IF EXISTS catalog_quest_poi_points;
DROP TABLE IF EXISTS catalog_quest_poi_blobs;
DROP TABLE IF EXISTS catalog_quest_line_entries;
DROP TABLE IF EXISTS catalog_quest_line_localizations;
DROP TABLE IF EXISTS catalog_quest_lines;
DROP TABLE IF EXISTS catalog_quest_objective_localizations;
DROP TABLE IF EXISTS catalog_quest_objectives;
DROP TABLE IF EXISTS catalog_quest_details;
DROP TABLE IF EXISTS catalog_quest_localizations;
DROP TABLE IF EXISTS catalog_quest_registry;
