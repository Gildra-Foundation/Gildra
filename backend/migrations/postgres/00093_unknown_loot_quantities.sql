-- +goose Up
-- ATT's explicit creature references prove that an item is associated with a
-- creature, but they do not prove a stack quantity.  NULL is therefore a
-- first-class state instead of silently claiming that every drop is exactly 1.
ALTER TABLE catalog_loot_entries
    DROP CONSTRAINT catalog_loot_entries_check,
    DROP CONSTRAINT catalog_loot_entries_min_quantity_check;

ALTER TABLE catalog_loot_entries
    ALTER COLUMN min_quantity DROP DEFAULT,
    ALTER COLUMN min_quantity DROP NOT NULL,
    ALTER COLUMN max_quantity DROP DEFAULT,
    ALTER COLUMN max_quantity DROP NOT NULL,
    ADD COLUMN quantity_basis TEXT NOT NULL DEFAULT 'unknown'
        CHECK (quantity_basis IN ('source_exact','observed','estimated','unknown')),
    ADD CONSTRAINT catalog_loot_entries_quantity_values_check CHECK (
        (quantity_basis = 'unknown' AND min_quantity IS NULL AND max_quantity IS NULL)
        OR
        (quantity_basis <> 'unknown' AND min_quantity IS NOT NULL AND max_quantity IS NOT NULL
            AND min_quantity > 0 AND max_quantity >= min_quantity)
    );

-- +goose Down
ALTER TABLE catalog_loot_entries
    DROP CONSTRAINT catalog_loot_entries_quantity_values_check,
    DROP COLUMN quantity_basis;

UPDATE catalog_loot_entries
SET min_quantity=1,max_quantity=1
WHERE min_quantity IS NULL OR max_quantity IS NULL;

ALTER TABLE catalog_loot_entries
    ALTER COLUMN min_quantity SET DEFAULT 1,
    ALTER COLUMN min_quantity SET NOT NULL,
    ALTER COLUMN max_quantity SET DEFAULT 1,
    ALTER COLUMN max_quantity SET NOT NULL,
    ADD CONSTRAINT catalog_loot_entries_min_quantity_check CHECK (min_quantity > 0),
    ADD CONSTRAINT catalog_loot_entries_check CHECK (max_quantity >= min_quantity);
