-- +goose Up
ALTER TABLE catalog_categories
    DROP CONSTRAINT catalog_categories_product_id_entity_type_facet_slug_key;

-- Category slugs are only unique inside their parent. The full path is the stable identity.
CREATE INDEX catalog_categories_facet_slug_idx
    ON catalog_categories (product_id, entity_type, facet, slug);

-- +goose Down
DROP INDEX IF EXISTS catalog_categories_facet_slug_idx;
ALTER TABLE catalog_categories
    ADD CONSTRAINT catalog_categories_product_id_entity_type_facet_slug_key
    UNIQUE (product_id, entity_type, facet, slug);
