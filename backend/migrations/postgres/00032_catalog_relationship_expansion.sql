-- +goose Up
CREATE TABLE catalog_spell_effects (
	spell_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
	effect_index SMALLINT NOT NULL CHECK (effect_index >= 0),
	difficulty_id INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_id >= 0),
    effect_type INTEGER NOT NULL DEFAULT 0,
    aura_type INTEGER NOT NULL DEFAULT 0,
    base_points NUMERIC,
    coefficient NUMERIC,
    attack_power_coefficient NUMERIC,
    amplitude_ms INTEGER CHECK (amplitude_ms IS NULL OR amplitude_ms >= 0),
    radius_index INTEGER,
    chain_targets INTEGER NOT NULL DEFAULT 0 CHECK (chain_targets >= 0),
    mechanic_id INTEGER,
    source TEXT NOT NULL CHECK (source IN ('db2', 'blizzard_api')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
	PRIMARY KEY (spell_version_id, effect_index, difficulty_id, source)
);
CREATE INDEX catalog_spell_effects_type_idx
    ON catalog_spell_effects (effect_type, aura_type, spell_version_id);

CREATE TABLE catalog_quest_rewards (
    build_id BIGINT NOT NULL,
    quest_id BIGINT NOT NULL,
    reward_type TEXT NOT NULL CHECK (reward_type IN ('item','currency','money','experience','reputation','spell','title','other')),
    reward_index SMALLINT NOT NULL DEFAULT 0 CHECK (reward_index >= 0),
    external_id BIGINT,
    item_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
    is_choice BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL CHECK (source IN ('db2','blizzard_api')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id, quest_id, reward_type, reward_index),
    FOREIGN KEY (build_id, quest_id)
        REFERENCES catalog_quest_registry(build_id, quest_id) ON DELETE CASCADE,
    CHECK (reward_type <> 'item' OR external_id IS NOT NULL)
);
CREATE INDEX catalog_quest_rewards_external_idx
    ON catalog_quest_rewards (reward_type, external_id, quest_id)
    WHERE external_id IS NOT NULL;
CREATE INDEX catalog_quest_rewards_item_entity_idx
    ON catalog_quest_rewards (item_entity_id, quest_id)
    WHERE item_entity_id IS NOT NULL;

CREATE TABLE catalog_npc_locations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    map_id INTEGER,
    ui_map_id INTEGER,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty_id INTEGER,
    source TEXT NOT NULL CHECK (source IN ('db2','blizzard_api','import')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (version_id, map_id, ui_map_id, x, y, z, difficulty_id, source)
);
CREATE INDEX catalog_npc_locations_map_idx
    ON catalog_npc_locations (ui_map_id, map_id, version_id);

ALTER TABLE catalog_item_acquisition_sources
    DROP CONSTRAINT catalog_item_acquisition_sources_source_type_check;
ALTER TABLE catalog_item_acquisition_sources
    ADD CONSTRAINT catalog_item_acquisition_sources_source_type_check
    CHECK (source_type IN ('encounter','crafting_recipe','blizzard_api','quest','vendor','container','world_drop'));
ALTER TABLE catalog_item_acquisition_sources
	ADD COLUMN chance_percent NUMERIC CHECK (chance_percent IS NULL OR (chance_percent >= 0 AND chance_percent <= 100)),
	ADD COLUMN source_url TEXT;

-- +goose Down
ALTER TABLE catalog_item_acquisition_sources
	DROP COLUMN IF EXISTS source_url,
	DROP COLUMN IF EXISTS chance_percent;
ALTER TABLE catalog_item_acquisition_sources
    DROP CONSTRAINT IF EXISTS catalog_item_acquisition_sources_source_type_check;
ALTER TABLE catalog_item_acquisition_sources
    ADD CONSTRAINT catalog_item_acquisition_sources_source_type_check
    CHECK (source_type IN ('encounter','crafting_recipe','blizzard_api'));
DROP TABLE IF EXISTS catalog_npc_locations;
DROP TABLE IF EXISTS catalog_quest_rewards;
DROP TABLE IF EXISTS catalog_spell_effects;
