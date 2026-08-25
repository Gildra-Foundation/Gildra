-- +goose Up
-- A catalog can only claim completeness against a recorded denominator. The
-- expectation and measurement tables keep that denominator, its provenance,
-- explicit exclusions, and an append-only history of every quality check.
CREATE TABLE catalog_completeness_expectations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id SMALLINT NOT NULL REFERENCES game_products(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    scope_key TEXT NOT NULL CHECK (scope_key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    locale TEXT NOT NULL DEFAULT '' CHECK (locale = '' OR locale ~ '^[a-z]{2}_[A-Z]{2}$'),
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    expected_count BIGINT NOT NULL CHECK (expected_count >= 0),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    expected_content_hash BYTEA CHECK (expected_content_hash IS NULL OR octet_length(expected_content_hash) = 32),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (build_id, scope_key, locale, source)
);

CREATE INDEX catalog_completeness_expectations_product_idx
    ON catalog_completeness_expectations (product_id, build_id DESC, entity_type, locale);

CREATE TABLE catalog_completeness_exclusions (
    expectation_id UUID NOT NULL REFERENCES catalog_completeness_expectations(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL CHECK (btrim(external_key) <> ''),
    reason_code TEXT NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (expectation_id, external_key)
);

CREATE TABLE catalog_completeness_measurements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expectation_id UUID NOT NULL REFERENCES catalog_completeness_expectations(id) ON DELETE CASCADE,
    imported_count BIGINT NOT NULL CHECK (imported_count >= 0),
    excluded_count BIGINT NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
    missing_count BIGINT NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
    invalid_count BIGINT NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
    status TEXT NOT NULL CHECK (status IN ('complete','incomplete','invalid','overfull')),
    coverage_percent NUMERIC(7,4) NOT NULL CHECK (coverage_percent >= 0),
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX catalog_completeness_measurements_latest_idx
    ON catalog_completeness_measurements (expectation_id, measured_at DESC, id DESC);

CREATE VIEW catalog_completeness_latest AS
SELECT DISTINCT ON (measurement.expectation_id)
    expectation.product_id,
    expectation.build_id,
    expectation.scope_key,
    expectation.entity_type,
    expectation.locale,
    expectation.source,
    expectation.expected_count,
    measurement.imported_count,
    measurement.excluded_count,
    measurement.missing_count,
    measurement.invalid_count,
    measurement.status,
    measurement.coverage_percent,
    measurement.details,
    measurement.measured_at
FROM catalog_completeness_measurements measurement
JOIN catalog_completeness_expectations expectation ON expectation.id=measurement.expectation_id
ORDER BY measurement.expectation_id,measurement.measured_at DESC,measurement.id DESC;

-- Battle.net Media API returns more than icons. Preserve every official asset
-- URL now; byte caching remains a separate, policy-gated operation.
CREATE TABLE catalog_entity_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    media_kind TEXT NOT NULL CHECK (media_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
    asset_key TEXT NOT NULL CHECK (btrim(asset_key) <> ''),
    locale TEXT NOT NULL DEFAULT '' CHECK (locale = '' OR locale ~ '^[a-z]{2}_[A-Z]{2}$'),
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
    cached_url TEXT CHECK (cached_url IS NULL OR cached_url ~ '^https://'),
    file_data_id BIGINT CHECK (file_data_id IS NULL OR file_data_id > 0),
    content_hash BYTEA CHECK (content_hash IS NULL OR octet_length(content_hash) = 32),
    mime_type TEXT NOT NULL DEFAULT '' CHECK (mime_type = '' OR mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    cache_status TEXT NOT NULL DEFAULT 'remote'
        CHECK (cache_status IN ('remote','cached','blocked','failed')),
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (build_id, entity_type, external_id, media_kind, asset_key, locale, source)
);

CREATE INDEX catalog_entity_media_entity_idx
    ON catalog_entity_media (build_id, entity_type, external_id, media_kind, is_primary DESC);
CREATE INDEX catalog_entity_media_file_data_idx
    ON catalog_entity_media (file_data_id)
    WHERE file_data_id IS NOT NULL;
CREATE INDEX catalog_entity_media_uncached_idx
    ON catalog_entity_media (source, build_id, media_kind, updated_at)
    WHERE cache_status = 'remote';
CREATE UNIQUE INDEX catalog_entity_media_primary_idx
    ON catalog_entity_media (build_id, entity_type, external_id, media_kind, locale, source)
    WHERE is_primary;

-- +goose Down
DROP TABLE IF EXISTS catalog_entity_media;
DROP VIEW IF EXISTS catalog_completeness_latest;
DROP TABLE IF EXISTS catalog_completeness_measurements;
DROP TABLE IF EXISTS catalog_completeness_exclusions;
DROP TABLE IF EXISTS catalog_completeness_expectations;
