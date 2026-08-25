-- +goose Up
ALTER TABLE catalog_entity_icons
    DROP CONSTRAINT catalog_entity_icons_entity_type_check;
ALTER TABLE catalog_entity_icons
    ADD CONSTRAINT catalog_entity_icons_entity_type_check
    CHECK (entity_type IN ('item','spell','currency','talent','pvp_talent','class','specialization'));

-- +goose Down
DELETE FROM catalog_entity_icons WHERE entity_type IN ('class','specialization');
ALTER TABLE catalog_entity_icons
    DROP CONSTRAINT catalog_entity_icons_entity_type_check;
ALTER TABLE catalog_entity_icons
    ADD CONSTRAINT catalog_entity_icons_entity_type_check
    CHECK (entity_type IN ('item','spell','currency','talent','pvp_talent'));
