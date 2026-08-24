-- +goose Up
CREATE TABLE catalog_entity_tooltips (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    plain_text TEXT NOT NULL DEFAULT '',
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocks) = 'array'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    source_url TEXT NOT NULL DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, locale)
);

CREATE INDEX catalog_entity_tooltips_locale_version_idx
    ON catalog_entity_tooltips (locale, version_id);

CREATE TABLE catalog_db2_rows (
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL CHECK (table_name ~ '^[A-Za-z][A-Za-z0-9_]{1,63}$'),
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    row_id BIGINT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    source_url TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (build_id, table_name, locale, row_id)
);

CREATE INDEX catalog_db2_rows_table_build_locale_idx
    ON catalog_db2_rows (table_name, build_id, locale, row_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_db2_rows;
DROP TABLE IF EXISTS catalog_entity_tooltips;
