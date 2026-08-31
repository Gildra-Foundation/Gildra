-- +goose Up
-- Repair releases re-run the complete, build-pinned source profile for an
-- already published build. They remain ordinary atomic releases; this flag
-- only tells the quality gate that equal build numbers are intentional.
ALTER TABLE catalog_releases
    ADD COLUMN is_repair BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX catalog_releases_repair_lookup_idx
    ON catalog_releases (product_id, build_version, is_repair, status);

-- +goose Down
DROP INDEX IF EXISTS catalog_releases_repair_lookup_idx;
ALTER TABLE catalog_releases
    DROP COLUMN IF EXISTS is_repair;
