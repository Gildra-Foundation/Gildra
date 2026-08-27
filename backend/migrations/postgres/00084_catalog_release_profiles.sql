-- +goose Up
CREATE TABLE catalog_release_profiles (
    profile_key TEXT PRIMARY KEY CHECK (profile_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
    pipeline_sources TEXT[] NOT NULL DEFAULT '{}',
    publication_sources TEXT[] NOT NULL DEFAULT '{}',
    locales TEXT[] NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (cardinality(pipeline_sources) > 0),
    CHECK (cardinality(publication_sources) > 0),
    CHECK (cardinality(locales) > 0),
    UNIQUE (product_id, profile_key)
);

CREATE TABLE catalog_release_profile_entity_types (
    profile_key TEXT NOT NULL REFERENCES catalog_release_profiles(profile_key) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    requirement TEXT NOT NULL CHECK (requirement IN ('required','optional','deferred')),
    minimum_count BIGINT NOT NULL DEFAULT 0 CHECK (minimum_count >= 0),
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (profile_key, entity_type),
    CHECK (requirement <> 'required' OR minimum_count > 0)
);

-- +goose Down
DROP TABLE IF EXISTS catalog_release_profile_entity_types;
DROP TABLE IF EXISTS catalog_release_profiles;
