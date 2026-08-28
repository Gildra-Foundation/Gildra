-- +goose Up
ALTER TABLE catalog_entity_media
    ADD COLUMN cache_key TEXT CHECK (cache_key IS NULL OR cache_key ~ '^[a-f0-9]{2}/[a-f0-9]{64}\.[a-z0-9]{2,8}$'),
    ADD COLUMN cached_content_hash BYTEA CHECK (cached_content_hash IS NULL OR octet_length(cached_content_hash)=32),
    ADD COLUMN cached_byte_size BIGINT CHECK (cached_byte_size IS NULL OR cached_byte_size > 0),
    ADD COLUMN cached_at TIMESTAMPTZ,
    ADD COLUMN cache_error TEXT NOT NULL DEFAULT '';

ALTER TABLE catalog_entity_media ADD CONSTRAINT catalog_entity_media_cached_proof_check CHECK (
    cache_status <> 'cached' OR (
        cache_key IS NOT NULL AND cached_url IS NOT NULL AND cached_content_hash IS NOT NULL
        AND cached_byte_size IS NOT NULL AND cached_at IS NOT NULL AND mime_type LIKE 'image/%'
    )
);

CREATE UNIQUE INDEX catalog_entity_media_cache_key_idx
    ON catalog_entity_media(cache_key) WHERE cache_key IS NOT NULL;

CREATE TABLE catalog_media_cache_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment TEXT NOT NULL CHECK (environment IN ('development','staging','production')),
    status TEXT NOT NULL CHECK (status IN ('running','succeeded','partial','failed')),
    requested_limit INTEGER NOT NULL CHECK (requested_limit BETWEEN 1 AND 10000),
    eligible_count BIGINT NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
    cached_count BIGINT NOT NULL DEFAULT 0 CHECK (cached_count >= 0),
    failed_count BIGINT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    skipped_count BIGINT NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
    byte_size BIGINT NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    error_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- +goose Down
DROP TABLE IF EXISTS catalog_media_cache_runs;
DROP INDEX IF EXISTS catalog_entity_media_cache_key_idx;
ALTER TABLE catalog_entity_media DROP CONSTRAINT IF EXISTS catalog_entity_media_cached_proof_check;
ALTER TABLE catalog_entity_media
    DROP COLUMN IF EXISTS cache_error,
    DROP COLUMN IF EXISTS cached_at,
    DROP COLUMN IF EXISTS cached_byte_size,
    DROP COLUMN IF EXISTS cached_content_hash,
    DROP COLUMN IF EXISTS cache_key;
