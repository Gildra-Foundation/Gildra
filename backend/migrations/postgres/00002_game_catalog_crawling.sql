-- +goose Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE game_products (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_builds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    build_number INTEGER NOT NULL CHECK (build_number > 0),
    version TEXT NOT NULL,
    released_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, build_number)
);

CREATE INDEX game_builds_active_idx
    ON game_builds (product_id, build_number DESC)
    WHERE is_active;

CREATE TABLE game_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id SMALLINT NOT NULL REFERENCES game_products(id),
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    canonical_slug TEXT NOT NULL DEFAULT '',
    first_seen_build_id BIGINT REFERENCES game_builds(id),
    last_seen_build_id BIGINT REFERENCES game_builds(id),
    latest_version_id UUID,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, entity_type, external_id)
);

CREATE INDEX game_entities_list_idx
    ON game_entities (product_id, entity_type, id)
    WHERE deleted_at IS NULL;

CREATE INDEX game_entities_slug_idx
    ON game_entities (product_id, entity_type, canonical_slug)
    WHERE deleted_at IS NULL;

CREATE TABLE game_entity_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT NOT NULL DEFAULT '',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, build_id, revision),
    UNIQUE (entity_id, build_id, content_hash)
);

ALTER TABLE game_entities
    ADD CONSTRAINT game_entities_latest_version_fk
    FOREIGN KEY (latest_version_id) REFERENCES game_entity_versions(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX game_entity_versions_history_idx
    ON game_entity_versions (entity_id, build_id DESC, revision DESC);

CREATE TABLE game_entity_localizations (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    slug TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    search_document TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple', name || ' ' || description)
    ) STORED,
    PRIMARY KEY (version_id, locale)
);

CREATE INDEX game_entity_localizations_search_idx
    ON game_entity_localizations USING GIN (search_document);

CREATE INDEX game_entity_localizations_name_trgm_idx
    ON game_entity_localizations USING GIN (name gin_trgm_ops);

CREATE INDEX game_entity_localizations_locale_slug_idx
    ON game_entity_localizations (locale, slug, version_id);

CREATE TABLE game_entity_links (
    source_entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    build_id BIGINT NOT NULL REFERENCES game_builds(id),
    relation_type TEXT NOT NULL CHECK (relation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_entity_id, target_entity_id, build_id, relation_type)
);

CREATE INDEX game_entity_links_reverse_idx
    ON game_entity_links (target_entity_id, relation_type, build_id DESC);

CREATE TABLE crawl_sources (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL UNIQUE CHECK (base_url ~ '^https://'),
    priority SMALLINT NOT NULL DEFAULT 100 CHECK (priority >= 0),
    public_data_only BOOLEAN NOT NULL DEFAULT true,
    enabled BOOLEAN NOT NULL DEFAULT false,
    robots_checked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE crawl_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id BIGINT NOT NULL REFERENCES crawl_sources(id),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
    provider_order TEXT[] NOT NULL DEFAULT ARRAY['scrape.do']::TEXT[],
    credit_budget NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (credit_budget >= 0),
    attempted_urls BIGINT NOT NULL DEFAULT 0 CHECK (attempted_urls >= 0),
    accepted_documents BIGINT NOT NULL DEFAULT 0 CHECK (accepted_documents >= 0),
    rejected_documents BIGINT NOT NULL DEFAULT 0 CHECK (rejected_documents >= 0),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crawl_runs_source_created_idx
    ON crawl_runs (source_id, created_at DESC);

CREATE INDEX crawl_runs_active_idx
    ON crawl_runs (status, created_at)
    WHERE status IN ('queued', 'running');

CREATE TABLE crawl_documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
    source_id BIGINT NOT NULL REFERENCES crawl_sources(id),
    entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    target_url TEXT NOT NULL,
    target_url_hash BYTEA NOT NULL CHECK (octet_length(target_url_hash) = 32),
    fetched_at TIMESTAMPTZ NOT NULL,
    target_status SMALLINT NOT NULL DEFAULT 0 CHECK (target_status BETWEEN 0 AND 599),
    verdict TEXT NOT NULL,
    provider TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT '',
    etag TEXT NOT NULL DEFAULT '',
    last_modified TEXT NOT NULL DEFAULT '',
    body_sha256 BYTEA CHECK (body_sha256 IS NULL OR octet_length(body_sha256) = 32),
    body_bytes BIGINT NOT NULL DEFAULT 0 CHECK (body_bytes >= 0),
    storage_uri TEXT NOT NULL DEFAULT '',
    extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, target_url_hash)
);

CREATE INDEX crawl_documents_source_fetched_idx
    ON crawl_documents (source_id, fetched_at DESC, id DESC);

CREATE INDEX crawl_documents_entity_fetched_idx
    ON crawl_documents (entity_id, fetched_at DESC)
    WHERE entity_id IS NOT NULL;

CREATE INDEX crawl_documents_failures_idx
    ON crawl_documents (verdict, fetched_at DESC)
    WHERE verdict <> 'OK';

-- +goose Down
ALTER TABLE game_entities DROP CONSTRAINT IF EXISTS game_entities_latest_version_fk;
DROP TABLE IF EXISTS crawl_documents;
DROP TABLE IF EXISTS crawl_runs;
DROP TABLE IF EXISTS crawl_sources;
DROP TABLE IF EXISTS game_entity_links;
DROP TABLE IF EXISTS game_entity_localizations;
DROP TABLE IF EXISTS game_entity_versions;
DROP TABLE IF EXISTS game_entities;
DROP TABLE IF EXISTS game_builds;
DROP TABLE IF EXISTS game_products;
