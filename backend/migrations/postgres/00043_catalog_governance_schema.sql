-- +goose Up
-- Catalog governance is data, not application constants. These registries make
-- source usage, entity types and graph semantics inspectable and extensible.
CREATE TABLE catalog_source_policies (
    source TEXT PRIMARY KEY CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    display_name TEXT NOT NULL CHECK (btrim(display_name) <> ''),
    homepage_url TEXT NOT NULL DEFAULT '' CHECK (homepage_url = '' OR homepage_url ~ '^https://'),
    terms_url TEXT NOT NULL DEFAULT '' CHECK (terms_url = '' OR terms_url ~ '^https://'),
    license_identifier TEXT NOT NULL DEFAULT 'NOASSERTION',
    commercial_use_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (commercial_use_status IN ('allowed','restricted','permission_required','prohibited','unknown')),
    public_api_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (public_api_status IN ('allowed','restricted','permission_required','prohibited','unknown')),
    asset_caching_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (asset_caching_status IN ('allowed','restricted','permission_required','prohibited','unknown')),
    retention_days INTEGER CHECK (retention_days IS NULL OR retention_days >= 0),
    attribution_required BOOLEAN NOT NULL DEFAULT false,
    attribution_text TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMPTZ,
    review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending','reviewed','expired','blocked')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_entity_type_registry (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    group_key TEXT NOT NULL DEFAULT 'other' CHECK (group_key ~ '^[a-z][a-z0-9_]{1,63}$'),
    icon_symbol TEXT NOT NULL DEFAULT '#ic-gem' CHECK (icon_symbol ~ '^#ic-[a-z0-9-]+$'),
    sort_order SMALLINT NOT NULL DEFAULT 1000,
    is_public BOOLEAN NOT NULL DEFAULT true,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, entity_type)
);

CREATE INDEX catalog_entity_type_registry_public_idx
    ON catalog_entity_type_registry (product_id, is_public, sort_order, entity_type);

CREATE TABLE catalog_entity_type_localizations (
    product_id SMALLINT NOT NULL,
    entity_type TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (product_id, entity_type, locale),
    FOREIGN KEY (product_id, entity_type)
        REFERENCES catalog_entity_type_registry(product_id, entity_type) ON DELETE CASCADE
);

CREATE TABLE catalog_relation_types (
    relation_type TEXT PRIMARY KEY CHECK (relation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    inverse_relation_type TEXT,
    allowed_source_types TEXT[] NOT NULL DEFAULT '{}',
    allowed_target_types TEXT[] NOT NULL DEFAULT '{}',
    attribute_schema JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attribute_schema) = 'object'),
    schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT catalog_relation_types_inverse_fk
        FOREIGN KEY (inverse_relation_type) REFERENCES catalog_relation_types(relation_type)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE catalog_relation_type_localizations (
    relation_type TEXT NOT NULL REFERENCES catalog_relation_types(relation_type) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (relation_type, locale)
);

CREATE TABLE catalog_entity_aliases (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    alias TEXT NOT NULL CHECK (length(btrim(alias)) BETWEEN 2 AND 200),
    alias_kind TEXT NOT NULL DEFAULT 'alternate_name'
        CHECK (alias_kind IN ('alternate_name','former_name','abbreviation','search_keyword')),
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, locale, alias, alias_kind, source)
);

CREATE INDEX catalog_entity_aliases_search_idx
    ON catalog_entity_aliases USING GIN (alias gin_trgm_ops);
CREATE INDEX catalog_entity_aliases_locale_version_idx
    ON catalog_entity_aliases (locale, version_id);

CREATE TABLE catalog_entity_type_stats (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    entity_count BIGINT NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
    localized_count BIGINT NOT NULL DEFAULT 0 CHECK (localized_count >= 0),
    described_count BIGINT NOT NULL DEFAULT 0 CHECK (described_count >= 0),
    tooltip_count BIGINT NOT NULL DEFAULT 0 CHECK (tooltip_count >= 0),
    icon_count BIGINT NOT NULL DEFAULT 0 CHECK (icon_count >= 0),
    relationship_count BIGINT NOT NULL DEFAULT 0 CHECK (relationship_count >= 0),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, entity_type, locale)
);

CREATE TABLE catalog_category_stats (
    category_id BIGINT PRIMARY KEY REFERENCES catalog_categories(id) ON DELETE CASCADE,
    entity_count BIGINT NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_field_coverage (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US','ru_RU')),
    field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_.]{1,127}$'),
    source TEXT NOT NULL DEFAULT 'projection' CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    entity_count BIGINT NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
    populated_count BIGINT NOT NULL DEFAULT 0 CHECK (populated_count >= 0 AND populated_count <= entity_count),
    unresolved_count BIGINT NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
    conflict_count BIGINT NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, build_id, entity_type, locale, field_key, source)
);

CREATE INDEX catalog_field_coverage_lookup_idx
    ON catalog_field_coverage (product_id, entity_type, locale, build_id DESC, field_key);

CREATE TABLE catalog_read_model_state (
    product_id SMALLINT PRIMARY KEY REFERENCES game_products(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'stale' CHECK (status IN ('fresh','refreshing','stale','failed')),
    generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
    refreshed_at TIMESTAMPTZ,
    error_message TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS catalog_read_model_state;
DROP TABLE IF EXISTS catalog_field_coverage;
DROP TABLE IF EXISTS catalog_category_stats;
DROP TABLE IF EXISTS catalog_entity_type_stats;
DROP TABLE IF EXISTS catalog_entity_aliases;
DROP TABLE IF EXISTS catalog_relation_type_localizations;
DROP TABLE IF EXISTS catalog_relation_types;
DROP TABLE IF EXISTS catalog_entity_type_localizations;
DROP TABLE IF EXISTS catalog_entity_type_registry;
DROP TABLE IF EXISTS catalog_source_policies;
