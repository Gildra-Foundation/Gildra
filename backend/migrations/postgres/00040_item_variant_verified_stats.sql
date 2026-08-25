-- +goose Up
ALTER TABLE catalog_item_variant_stats
    ADD COLUMN stat_key TEXT,
    ADD COLUMN stat_label TEXT,
    ADD COLUMN locale TEXT CHECK (locale IS NULL OR locale IN ('en_US','ru_RU')),
    ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('db2','raidbots','wowhead_tooltip','blizzard_api'));
CREATE INDEX catalog_item_variant_stats_key_idx
    ON catalog_item_variant_stats(stat_key,value,variant_id) WHERE stat_key IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_item_variant_stats_key_idx;
ALTER TABLE catalog_item_variant_stats
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS locale,
    DROP COLUMN IF EXISTS stat_label,
    DROP COLUMN IF EXISTS stat_key;
