-- +goose Up
CREATE TABLE catalog_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    parent_id BIGINT REFERENCES catalog_categories(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    facet TEXT NOT NULL CHECK (facet ~ '^[a-z][a-z0-9_]{1,63}$'),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
    path TEXT NOT NULL CHECK (path ~ '^[a-z0-9][a-z0-9_/-]{0,190}$'),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, entity_type, path),
    UNIQUE (product_id, entity_type, facet, slug)
);

CREATE INDEX catalog_categories_parent_idx ON catalog_categories (parent_id, sort_order, id);
CREATE INDEX catalog_categories_product_type_idx ON catalog_categories (product_id, entity_type, facet, sort_order, id);

CREATE TABLE catalog_category_localizations (
    category_id BIGINT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    name TEXT NOT NULL CHECK (name <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (category_id, locale)
);

CREATE INDEX catalog_category_localizations_locale_idx
    ON catalog_category_localizations (locale, name, category_id);

CREATE TABLE game_entity_categories (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, category_id)
);

CREATE INDEX game_entity_categories_category_version_idx
    ON game_entity_categories (category_id, version_id);

CREATE TABLE catalog_item_tooltips (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    plain_text TEXT NOT NULL DEFAULT '',
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocks) = 'array'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    source_url TEXT NOT NULL DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, locale)
);

CREATE INDEX catalog_item_tooltips_locale_version_idx
    ON catalog_item_tooltips (locale, version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_item_tooltips;
DROP TABLE IF EXISTS game_entity_categories;
DROP TABLE IF EXISTS catalog_category_localizations;
DROP TABLE IF EXISTS catalog_categories;
