-- +goose Up
-- Superseded releases retain their original publication timestamp as useful
-- provenance. Only the active published state requires a timestamp.
ALTER TABLE lol_catalog_releases
    DROP CONSTRAINT IF EXISTS lol_catalog_releases_check;

ALTER TABLE lol_catalog_releases
    ADD CONSTRAINT lol_catalog_releases_published_at_check
    CHECK (status <> 'published' OR published_at IS NOT NULL);

-- +goose Down
ALTER TABLE lol_catalog_releases
    DROP CONSTRAINT IF EXISTS lol_catalog_releases_published_at_check;

ALTER TABLE lol_catalog_releases
    ADD CONSTRAINT lol_catalog_releases_check
    CHECK ((status = 'published') = (published_at IS NOT NULL));
