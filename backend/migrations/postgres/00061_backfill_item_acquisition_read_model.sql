-- +goose Up
SELECT refresh_catalog_item_acquisition_methods(NULL);

-- +goose Down
DELETE FROM catalog_item_acquisition_methods;
