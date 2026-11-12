-- +goose Up
-- Client reference tables behind the numbers of an item tooltip: stat budgets,
-- weapon damage and armor by item level, per-level multipliers, the item level
-- squish curve, scaled enchantment amounts and the Russian enchantment texts.
-- They are read-only source data of one build and are replaced as a whole;
-- no entity, version or projection row refers to them.
CREATE TABLE catalog_item_reference_sources (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL CHECK (table_name ~ '^[A-Za-z][A-Za-z0-9_]{1,63}$'),
    source_url TEXT NOT NULL CHECK (source_url <> ''),
    content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (build_id, table_name)
);

CREATE TABLE catalog_item_reference_rows (
    build_id BIGINT NOT NULL,
    table_name TEXT NOT NULL,
    row_key BIGINT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (build_id, table_name, row_key),
    FOREIGN KEY (build_id, table_name)
        REFERENCES catalog_item_reference_sources (build_id, table_name) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE IF EXISTS catalog_item_reference_rows;
DROP TABLE IF EXISTS catalog_item_reference_sources;
