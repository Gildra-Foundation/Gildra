-- +goose Up
-- Dataset cards must point only at an immutable locally cached media row. The
-- existing preview_icon_name remains as source metadata and as a decorative
-- fallback; it is not a public delivery URL.
ALTER TABLE catalog_library_dataset_stats
    ADD COLUMN preview_media_id UUID REFERENCES catalog_entity_media(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE catalog_library_dataset_stats
    DROP COLUMN IF EXISTS preview_media_id;
