-- +goose Up
CREATE TABLE catalog_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT REFERENCES game_builds(id) ON DELETE RESTRICT,
    pipeline_run_id BIGINT UNIQUE REFERENCES catalog_pipeline_runs(id) ON DELETE SET NULL,
    previous_release_id UUID REFERENCES catalog_releases(id) ON DELETE SET NULL,
    build_version TEXT NOT NULL CHECK (btrim(build_version) <> ''),
    status TEXT NOT NULL DEFAULT 'staging'
        CHECK (status IN ('staging','validating','published','failed','superseded')),
    requested_sources TEXT[] NOT NULL DEFAULT '{}',
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (published_at IS NULL OR validated_at IS NOT NULL),
    CHECK (failed_at IS NULL OR status = 'failed')
);

CREATE TABLE catalog_public_release_state (
    product_id SMALLINT PRIMARY KEY REFERENCES game_products(id) ON DELETE CASCADE,
    release_id UUID NOT NULL UNIQUE REFERENCES catalog_releases(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalog_snapshots
    ADD COLUMN release_id UUID REFERENCES catalog_releases(id) ON DELETE SET NULL;

ALTER TABLE game_entities
    ADD COLUMN published_version_id UUID;
ALTER TABLE game_entities
    ADD CONSTRAINT game_entities_published_version_fk
    FOREIGN KEY (published_version_id) REFERENCES game_entity_versions(id)
    DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- +goose Down
ALTER TABLE game_entities
    DROP CONSTRAINT IF EXISTS game_entities_published_version_fk,
    DROP COLUMN IF EXISTS published_version_id;
ALTER TABLE catalog_snapshots DROP COLUMN IF EXISTS release_id;
DROP TABLE IF EXISTS catalog_public_release_state;
DROP TABLE IF EXISTS catalog_releases;
