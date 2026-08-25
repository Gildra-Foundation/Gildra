-- +goose Up
CREATE TABLE catalog_quest_package_items (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    row_id BIGINT NOT NULL CHECK (row_id > 0),
    package_id BIGINT NOT NULL CHECK (package_id > 0),
    item_external_id BIGINT NOT NULL CHECK (item_external_id > 0),
    item_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    display_type SMALLINT NOT NULL CHECK (display_type >= 0),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (build_id, row_id)
);
CREATE INDEX catalog_quest_package_items_package_idx
    ON catalog_quest_package_items(build_id, package_id, display_type, row_id);
CREATE INDEX catalog_quest_package_items_item_idx
    ON catalog_quest_package_items(item_entity_id, package_id)
    WHERE item_entity_id IS NOT NULL;
CREATE INDEX catalog_quest_package_items_artifact_idx
    ON catalog_quest_package_items(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

ALTER TABLE catalog_entity_icons
    DROP CONSTRAINT catalog_entity_icons_entity_type_check;
ALTER TABLE catalog_entity_icons
    ADD CONSTRAINT catalog_entity_icons_entity_type_check
    CHECK (entity_type IN ('item','spell','currency','talent','pvp_talent'));

-- +goose Down
DELETE FROM catalog_entity_icons WHERE entity_type IN ('talent','pvp_talent');
ALTER TABLE catalog_entity_icons
    DROP CONSTRAINT catalog_entity_icons_entity_type_check;
ALTER TABLE catalog_entity_icons
    ADD CONSTRAINT catalog_entity_icons_entity_type_check
    CHECK (entity_type IN ('item','spell','currency'));
DROP TABLE IF EXISTS catalog_quest_package_items;
