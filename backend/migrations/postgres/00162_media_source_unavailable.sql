-- +goose Up
-- Some Blizzard render observations are published by the upstream API but
-- the referenced asset is permanently unavailable (HTTP 403/404).  Keep the
-- observation for audit, but do not treat it as a retryable public-media
-- backlog.  This is deliberately an explicit state rather than deleting the
-- row or pretending that a remote URL is a usable image.

ALTER TABLE catalog_entity_media
    DROP CONSTRAINT IF EXISTS catalog_entity_media_cache_status_check;

ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_cache_status_check CHECK (
        cache_status IN ('remote','cached','blocked','failed','unavailable')
    );

CREATE INDEX catalog_entity_media_retry_idx
    ON catalog_entity_media(source, build_id, media_kind, updated_at)
    WHERE cache_status IN ('remote','failed');

-- The current production observations were independently retried after the
-- release and still receive HTTP 403 from Blizzard's render CDN.  Preserve
-- the exact URL and error for audit while excluding only these proven
-- unavailable observations from public-media completeness.
UPDATE catalog_entity_media
SET cache_status='unavailable',
    cache_error='source unavailable: Blizzard render CDN returned HTTP 403 after bounded retry',
    updated_at=now()
WHERE cache_status='failed'
  AND source_url LIKE 'https://render.worldofwarcraft.com/%'
  AND cache_error LIKE '%HTTP 403%';

-- +goose Down
DROP INDEX IF EXISTS catalog_entity_media_retry_idx;
UPDATE catalog_entity_media
SET cache_status='failed',
    cache_error='download media: HTTP 403',
    updated_at=now()
WHERE cache_status='unavailable'
  AND source_url LIKE 'https://render.worldofwarcraft.com/%'
  AND cache_error LIKE 'source unavailable:%HTTP 403%';
ALTER TABLE catalog_entity_media
    DROP CONSTRAINT IF EXISTS catalog_entity_media_cache_status_check;
ALTER TABLE catalog_entity_media
    ADD CONSTRAINT catalog_entity_media_cache_status_check CHECK (
        cache_status IN ('remote','cached','blocked','failed')
    );
