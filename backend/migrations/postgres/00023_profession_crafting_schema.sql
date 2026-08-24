-- +goose Up
CREATE TABLE catalog_professions (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    skill_line_id INTEGER NOT NULL CHECK (skill_line_id > 0),
    parent_skill_line_id INTEGER CHECK (parent_skill_line_id IS NULL OR parent_skill_line_id > 0),
    category_id INTEGER NOT NULL,
    parent_tier_index INTEGER,
    icon_file_data_id BIGINT CHECK (icon_file_data_id IS NULL OR icon_file_data_id > 0),
    can_link BOOLEAN NOT NULL DEFAULT false,
    flags BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX catalog_professions_skill_line_idx
    ON catalog_professions (skill_line_id, version_id);
CREATE INDEX catalog_professions_parent_idx
    ON catalog_professions (parent_skill_line_id, skill_line_id)
    WHERE parent_skill_line_id IS NOT NULL;

CREATE TABLE catalog_trade_skill_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL CHECK (external_id > 0),
    parent_external_id INTEGER CHECK (parent_external_id IS NULL OR parent_external_id > 0),
    skill_line_id INTEGER NOT NULL CHECK (skill_line_id > 0),
    order_index INTEGER NOT NULL DEFAULT 0,
    flags BIGINT NOT NULL DEFAULT 0,
    UNIQUE (build_id, external_id)
);

CREATE INDEX catalog_trade_skill_categories_tree_idx
    ON catalog_trade_skill_categories (build_id, skill_line_id, parent_external_id, order_index, external_id);

CREATE TABLE catalog_trade_skill_category_localizations (
    category_id BIGINT NOT NULL REFERENCES catalog_trade_skill_categories(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    PRIMARY KEY (category_id, locale)
);

CREATE INDEX catalog_trade_skill_category_localizations_locale_idx
    ON catalog_trade_skill_category_localizations (locale, name, category_id);

CREATE TABLE catalog_recipes (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    spell_id INTEGER NOT NULL CHECK (spell_id > 0),
    crafting_data_id INTEGER CHECK (crafting_data_id IS NULL OR crafting_data_id > 0),
    recipe_type INTEGER,
    crafting_difficulty_id INTEGER,
    crafting_difficulty INTEGER
);

CREATE INDEX catalog_recipes_spell_idx ON catalog_recipes (spell_id, version_id);
CREATE INDEX catalog_recipes_crafting_data_idx
    ON catalog_recipes (crafting_data_id, version_id)
    WHERE crafting_data_id IS NOT NULL;

CREATE TABLE catalog_profession_recipes (
    profession_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    recipe_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    trade_skill_category_id BIGINT REFERENCES catalog_trade_skill_categories(id) ON DELETE SET NULL,
    min_skill_rank INTEGER NOT NULL DEFAULT 0,
    trivial_rank_low INTEGER NOT NULL DEFAULT 0,
    trivial_rank_high INTEGER NOT NULL DEFAULT 0,
    acquire_method INTEGER NOT NULL DEFAULT 0,
    supercedes_spell_id INTEGER,
    flags BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (profession_version_id, recipe_version_id)
);

CREATE INDEX catalog_profession_recipes_recipe_idx
    ON catalog_profession_recipes (recipe_version_id, profession_version_id);
CREATE INDEX catalog_profession_recipes_category_idx
    ON catalog_profession_recipes (trade_skill_category_id, recipe_version_id)
    WHERE trade_skill_category_id IS NOT NULL;

CREATE TABLE catalog_recipe_reagents (
    recipe_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 7),
    item_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    item_external_id INTEGER NOT NULL CHECK (item_external_id > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    recraft_quantity INTEGER NOT NULL DEFAULT 0 CHECK (recraft_quantity >= 0),
    source_type INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_version_id, slot)
);

CREATE INDEX catalog_recipe_reagents_item_idx
    ON catalog_recipe_reagents (item_entity_id, recipe_version_id)
    WHERE item_entity_id IS NOT NULL;
CREATE INDEX catalog_recipe_reagents_external_item_idx
    ON catalog_recipe_reagents (item_external_id, recipe_version_id);

CREATE TABLE catalog_recipe_currencies (
    recipe_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    currency_external_id INTEGER NOT NULL CHECK (currency_external_id > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    recraft_quantity INTEGER NOT NULL DEFAULT 0 CHECK (recraft_quantity >= 0),
    order_index INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_version_id, currency_external_id)
);

CREATE TABLE catalog_recipe_outputs (
    recipe_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    item_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    item_external_id INTEGER NOT NULL CHECK (item_external_id > 0),
    source TEXT NOT NULL CHECK (source IN ('crafting_data', 'spell_effect')),
    PRIMARY KEY (recipe_version_id, item_external_id, source)
);

CREATE INDEX catalog_recipe_outputs_item_idx
    ON catalog_recipe_outputs (item_entity_id, recipe_version_id)
    WHERE item_entity_id IS NOT NULL;
CREATE INDEX catalog_recipe_outputs_external_item_idx
    ON catalog_recipe_outputs (item_external_id, recipe_version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_recipe_outputs;
DROP TABLE IF EXISTS catalog_recipe_currencies;
DROP TABLE IF EXISTS catalog_recipe_reagents;
DROP TABLE IF EXISTS catalog_profession_recipes;
DROP TABLE IF EXISTS catalog_recipes;
DROP TABLE IF EXISTS catalog_trade_skill_category_localizations;
DROP TABLE IF EXISTS catalog_trade_skill_categories;
DROP TABLE IF EXISTS catalog_professions;
