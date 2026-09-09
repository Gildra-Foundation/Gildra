-- +goose Up
-- Dataset entity counts became locale- and usability-aware in migration 150.
-- The older media-only refresh retained its raw membership query and could
-- therefore write an image count larger than the player-visible entity count.
-- Reuse the canonical refresh so both values always have the same scope.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_library_media_coverage(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_catalog_library_datasets(selected_product_id);
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- Keep the canonical refresh on rollback as well.  The function signature is
-- unchanged, and reverting to the previous raw-scope calculation could again
-- violate catalog_library_dataset_stats_check3.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_catalog_library_media_coverage(selected_product_id SMALLINT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM refresh_catalog_library_datasets(selected_product_id);
END;
$$;
-- +goose StatementEnd
