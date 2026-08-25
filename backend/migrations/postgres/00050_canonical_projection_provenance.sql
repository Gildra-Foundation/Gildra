-- +goose Up
ALTER TABLE catalog_entity_mentions
    DROP CONSTRAINT catalog_entity_mentions_source_check;
ALTER TABLE catalog_entity_mentions
    ADD CONSTRAINT catalog_entity_mentions_source_check
    CHECK (source IN ('verified_description_exact', 'canonical_description_exact'));

ALTER TABLE catalog_item_acquisition_sources
    ADD COLUMN chance_source TEXT
        CHECK (chance_source IS NULL OR chance_source IN ('db2', 'blizzard_api', 'observed', 'wowhead_tooltip'));
CREATE INDEX catalog_item_acquisition_sources_chance_source_idx
    ON catalog_item_acquisition_sources (chance_source, version_id)
    WHERE chance_source IS NOT NULL;

CREATE TABLE catalog_projection_watermarks (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    projector TEXT NOT NULL CHECK (projector ~ '^[a-z][a-z0-9_]{1,63}$'),
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    content_hash BYTEA,
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (product_id, projector),
    CHECK ((status = 'running' AND completed_at IS NULL) OR status <> 'running')
);
CREATE INDEX catalog_projection_watermarks_build_idx
    ON catalog_projection_watermarks (build_id DESC, product_id, projector);

CREATE TABLE catalog_build_update_checks (
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9_]{1,63}$'),
    channel TEXT NOT NULL DEFAULT 'live' CHECK (channel ~ '^[a-z][a-z0-9_-]{1,31}$'),
    observed_build TEXT NOT NULL CHECK (btrim(observed_build) <> ''),
    observed_build_number BIGINT CHECK (observed_build_number IS NULL OR observed_build_number > 0),
    manifest_etag TEXT,
    manifest_hash BYTEA,
    status TEXT NOT NULL CHECK (status IN ('current', 'update_available', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, source, channel)
);
CREATE INDEX catalog_build_update_checks_status_idx
    ON catalog_build_update_checks (status, checked_at DESC, product_id)
    WHERE status <> 'current';

-- +goose Down
DROP TABLE IF EXISTS catalog_build_update_checks;
DROP TABLE IF EXISTS catalog_projection_watermarks;
DROP INDEX IF EXISTS catalog_item_acquisition_sources_chance_source_idx;
ALTER TABLE catalog_item_acquisition_sources DROP COLUMN IF EXISTS chance_source;
ALTER TABLE catalog_entity_mentions
    DROP CONSTRAINT IF EXISTS catalog_entity_mentions_source_check;
ALTER TABLE catalog_entity_mentions
    ADD CONSTRAINT catalog_entity_mentions_source_check
    CHECK (source IN ('verified_description_exact'));
