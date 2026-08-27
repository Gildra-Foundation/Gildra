-- +goose Up
ALTER TABLE catalog_npc_locations
    DROP CONSTRAINT catalog_npc_locations_source_check;
ALTER TABLE catalog_npc_locations
    ADD CONSTRAINT catalog_npc_locations_source_check
    CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$');

-- +goose Down
DELETE FROM catalog_npc_locations
WHERE source NOT IN ('db2','blizzard_api','import');
ALTER TABLE catalog_npc_locations
    DROP CONSTRAINT catalog_npc_locations_source_check;
ALTER TABLE catalog_npc_locations
    ADD CONSTRAINT catalog_npc_locations_source_check
    CHECK (source IN ('db2','blizzard_api','import'));
