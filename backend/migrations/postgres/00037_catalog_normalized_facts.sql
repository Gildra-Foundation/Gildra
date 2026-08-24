-- +goose Up
CREATE TABLE catalog_source_priorities (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL DEFAULT '*' CHECK (btrim(entity_type) <> ''),
    field_path TEXT NOT NULL DEFAULT '*' CHECK (btrim(field_path) <> ''),
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    priority SMALLINT NOT NULL CHECK (priority BETWEEN 0 AND 1000),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (product_id, entity_type, field_path, source)
);

INSERT INTO catalog_source_priorities(product_id,entity_type,field_path,source,priority,confidence,notes)
SELECT id,'*','*','blizzard_api',100,1,'Official localized and profile/game-data API'
FROM game_products WHERE slug='wow'
UNION ALL SELECT id,'*','*','wago_tools',90,1,'Client DB2 data for the exact game build'
FROM game_products WHERE slug='wow'
UNION ALL SELECT id,'*','*','raidbots',80,0.95,'SimulationCraft-derived structured data'
FROM game_products WHERE slug='wow'
ON CONFLICT DO NOTHING;

CREATE TABLE catalog_item_bonus_rules (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    bonus_id BIGINT NOT NULL CHECK (bonus_id > 0),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (build_id, bonus_id)
);
CREATE INDEX catalog_item_bonus_rules_artifact_idx ON catalog_item_bonus_rules(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

CREATE TABLE catalog_item_level_curve_points (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    curve_id BIGINT NOT NULL CHECK (curve_id > 0),
    point_index INTEGER NOT NULL CHECK (point_index >= 0),
    player_level NUMERIC,
    item_level NUMERIC,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id, curve_id, point_index)
);
CREATE INDEX catalog_item_level_curve_points_lookup_idx
    ON catalog_item_level_curve_points(build_id,curve_id,player_level,item_level);

CREATE TABLE catalog_item_specialization_rules (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    item_class_id INTEGER NOT NULL,
    item_subclass_id INTEGER NOT NULL,
    specialization_id INTEGER NOT NULL CHECK (specialization_id > 0),
    can_use BOOLEAN NOT NULL DEFAULT false,
    can_drop BOOLEAN NOT NULL DEFAULT false,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id,item_class_id,item_subclass_id,specialization_id)
);
CREATE INDEX catalog_item_specialization_rules_spec_idx
    ON catalog_item_specialization_rules(build_id,specialization_id,can_use,can_drop);

CREATE TABLE catalog_class_trait_trees (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL CHECK (class_id > 0),
    trait_tree_id BIGINT NOT NULL CHECK (trait_tree_id > 0),
    skill_line_id BIGINT,
    class_name TEXT NOT NULL CHECK (btrim(class_name) <> ''),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id,class_id,trait_tree_id)
);

CREATE TABLE catalog_class_trait_tree_specializations (
    build_id BIGINT NOT NULL,
    class_id INTEGER NOT NULL,
    trait_tree_id BIGINT NOT NULL,
    specialization_id INTEGER NOT NULL CHECK (specialization_id > 0),
    PRIMARY KEY (build_id,class_id,trait_tree_id,specialization_id),
    FOREIGN KEY (build_id,class_id,trait_tree_id)
        REFERENCES catalog_class_trait_trees(build_id,class_id,trait_tree_id) ON DELETE CASCADE
);
CREATE INDEX catalog_class_trait_tree_specializations_spec_idx
    ON catalog_class_trait_tree_specializations(build_id,specialization_id,trait_tree_id);

CREATE TABLE catalog_entity_icons (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('item','spell','currency')),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    icon_name TEXT NOT NULL CHECK (btrim(icon_name) <> ''),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    PRIMARY KEY (build_id,entity_type,external_id)
);
CREATE INDEX catalog_entity_icons_name_idx ON catalog_entity_icons(icon_name,entity_type);

CREATE TABLE catalog_item_conversions (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    conversion_id BIGINT NOT NULL CHECK (conversion_id > 0),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (build_id,conversion_id)
);

ALTER TABLE catalog_journal_instances
    ADD COLUMN entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX catalog_journal_instances_entity_idx ON catalog_journal_instances(entity_id)
    WHERE entity_id IS NOT NULL;

ALTER TABLE catalog_journal_encounters
    ADD COLUMN entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX catalog_journal_encounters_entity_idx ON catalog_journal_encounters(entity_id)
    WHERE entity_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_journal_encounters_entity_idx;
ALTER TABLE catalog_journal_encounters DROP COLUMN IF EXISTS entity_id;
DROP INDEX IF EXISTS catalog_journal_instances_entity_idx;
ALTER TABLE catalog_journal_instances DROP COLUMN IF EXISTS entity_id;
DROP TABLE IF EXISTS catalog_item_conversions;
DROP TABLE IF EXISTS catalog_entity_icons;
DROP TABLE IF EXISTS catalog_class_trait_tree_specializations;
DROP TABLE IF EXISTS catalog_class_trait_trees;
DROP TABLE IF EXISTS catalog_item_specialization_rules;
DROP TABLE IF EXISTS catalog_item_level_curve_points;
DROP TABLE IF EXISTS catalog_item_bonus_rules;
DROP TABLE IF EXISTS catalog_source_priorities;
