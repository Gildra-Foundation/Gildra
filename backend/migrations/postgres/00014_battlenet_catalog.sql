-- +goose Up
CREATE TABLE game_namespaces (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    region TEXT NOT NULL CHECK (region IN ('us', 'eu', 'kr', 'tw')),
    kind TEXT NOT NULL CHECK (kind IN ('static', 'dynamic', 'profile')),
    slug TEXT NOT NULL CHECK (slug ~ '^(static|dynamic|profile)-(us|eu|kr|tw)$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, slug)
);

CREATE INDEX game_namespaces_product_idx ON game_namespaces (product_id);

ALTER TABLE game_entities
    ADD COLUMN namespace_id SMALLINT REFERENCES game_namespaces(id);

CREATE INDEX game_entities_namespace_idx
    ON game_entities (namespace_id, entity_type, external_id)
    WHERE namespace_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX game_entities_namespaced_identity_idx
    ON game_entities (product_id, namespace_id, entity_type, external_id)
    WHERE namespace_id IS NOT NULL;

CREATE TABLE catalog_import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    source TEXT NOT NULL CHECK (source IN ('battlenet', 'casc_db2', 'wago_tools')),
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    records_seen BIGINT NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
    records_written BIGINT NOT NULL DEFAULT 0 CHECK (records_written >= 0),
    error_summary TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX catalog_import_runs_product_started_idx
    ON catalog_import_runs (product_id, started_at DESC);
CREATE INDEX catalog_import_runs_build_idx ON catalog_import_runs (build_id);

CREATE TABLE catalog_items (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    quality TEXT,
    item_level INTEGER CHECK (item_level IS NULL OR item_level >= 0),
    required_level INTEGER CHECK (required_level IS NULL OR required_level >= 0),
    inventory_type TEXT,
    item_class_id INTEGER,
    item_subclass_id INTEGER,
    max_count INTEGER,
    purchase_price BIGINT,
    sell_price BIGINT,
    is_equippable BOOLEAN,
    is_stackable BOOLEAN
);

CREATE INDEX catalog_items_class_idx ON catalog_items (item_class_id, item_subclass_id);
CREATE INDEX catalog_items_level_idx ON catalog_items (item_level DESC);

CREATE TABLE catalog_spells (
    version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    school TEXT,
    cast_time TEXT,
    cooldown_ms INTEGER CHECK (cooldown_ms IS NULL OR cooldown_ms >= 0),
    min_range DOUBLE PRECISION,
    max_range DOUBLE PRECISION
);

-- +goose Down
DROP TABLE IF EXISTS catalog_spells;
DROP TABLE IF EXISTS catalog_items;
DROP TABLE IF EXISTS catalog_import_runs;
DROP INDEX IF EXISTS game_entities_namespaced_identity_idx;
DROP INDEX IF EXISTS game_entities_namespace_idx;
ALTER TABLE game_entities DROP COLUMN IF EXISTS namespace_id;
DROP TABLE IF EXISTS game_namespaces;
