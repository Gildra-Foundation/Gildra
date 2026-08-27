-- +goose Up
ALTER TABLE catalog_item_acquisition_sources
    DROP CONSTRAINT catalog_item_acquisition_sources_source_type_check;
ALTER TABLE catalog_item_acquisition_sources
    ADD CONSTRAINT catalog_item_acquisition_sources_source_type_check
    CHECK (source_type IN (
        'encounter','crafting_recipe','blizzard_api','quest','vendor','container','world_drop',
        'community_provider'
    ));

-- +goose Down
DELETE FROM catalog_item_acquisition_sources WHERE source_type='community_provider';
ALTER TABLE catalog_item_acquisition_sources
    DROP CONSTRAINT catalog_item_acquisition_sources_source_type_check;
ALTER TABLE catalog_item_acquisition_sources
    ADD CONSTRAINT catalog_item_acquisition_sources_source_type_check
    CHECK (source_type IN ('encounter','crafting_recipe','blizzard_api','quest','vendor','container','world_drop'));
