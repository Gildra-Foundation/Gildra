-- +goose Up
-- Small published-only ordering projection. Never copies historical payloads.
-- Indexes are built CONCURRENTLY in 00189; none of the indexes removed by
-- 00178 are restored. Source truth and visibility gates remain in the API.
ALTER TABLE catalog_library_dataset_definitions ADD COLUMN default_order TEXT NOT NULL DEFAULT 'current'
 CHECK (default_order IN ('current','name_asc','name_desc','item_level_desc','item_level_asc','required_level_desc','required_level_asc','id'));
CREATE TABLE catalog_delivery_state (product_id SMALLINT NOT NULL, refreshed_at TIMESTAMPTZ NOT NULL);
CREATE TABLE catalog_delivery_order (
 entity_id UUID NOT NULL, version_id UUID NOT NULL, product_id SMALLINT NOT NULL,
 entity_type TEXT NOT NULL, locale TEXT NOT NULL, name TEXT NOT NULL,
 expansion_order INTEGER NOT NULL, item_level INTEGER, required_level INTEGER,
 external_id BIGINT NOT NULL, item_class_id INTEGER, item_subclass_id INTEGER,
 name_search TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple',name)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.02,autovacuum_analyze_scale_factor=0.01);
-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_delivery_order(selected_product_id SMALLINT DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(188,0);
 DELETE FROM catalog_delivery_order WHERE selected_product_id IS NULL OR product_id=selected_product_id;
 INSERT INTO catalog_delivery_order(entity_id,version_id,product_id,entity_type,locale,name,expansion_order,item_level,required_level,external_id,item_class_id,item_subclass_id)
 SELECT e.id,v.id,e.product_id,e.entity_type,loc.locale,
 lower(COALESCE(NULLIF(l.name,''),fallback.name,'')),
 CASE WHEN e.entity_type='item' THEN COALESCE(x.external_expansion_id,-1) ELSE -1 END,
 i.item_level,i.required_level,e.external_id,i.item_class_id,i.item_subclass_id
 FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id
 CROSS JOIN (VALUES ('en_US'),('ru_RU')) loc(locale)
 LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale=loc.locale
 LEFT JOIN game_entity_localizations fallback ON fallback.version_id=v.id AND fallback.locale='en_US'
 LEFT JOIN catalog_items i ON i.version_id=v.id
 LEFT JOIN catalog_entity_expansions membership ON membership.product_id=e.product_id AND membership.build_id=v.build_id
 AND membership.entity_type=e.entity_type AND membership.external_id=e.external_id AND membership.classification='confirmed'
 LEFT JOIN catalog_expansions x ON x.id=membership.expansion_id AND x.product_id=e.product_id
 WHERE e.deleted_at IS NULL AND (selected_product_id IS NULL OR e.product_id=selected_product_id);
 DELETE FROM catalog_delivery_state WHERE selected_product_id IS NULL OR product_id=selected_product_id;
 INSERT INTO catalog_delivery_state SELECT id,clock_timestamp() FROM game_products WHERE selected_product_id IS NULL OR id=selected_product_id;
END $$;
-- +goose StatementEnd
ALTER FUNCTION refresh_catalog_read_models(SMALLINT) RENAME TO refresh_catalog_read_models_v187;
-- +goose StatementBegin
CREATE FUNCTION refresh_catalog_read_models(selected_product_id SMALLINT DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM refresh_catalog_read_models_v187(selected_product_id);
 PERFORM refresh_catalog_delivery_order(selected_product_id);
END $$;
-- +goose StatementEnd
-- Bootstrap is explicit: run refresh_catalog_delivery_order after 00188
-- and before 00189 to build the indexes on a populated projection; switch
-- the API only after both migrations and the bootstrap succeed. Publication/repair thereafter refresh atomically.
-- +goose Down
DROP FUNCTION refresh_catalog_read_models(SMALLINT);
ALTER FUNCTION refresh_catalog_read_models_v187(SMALLINT) RENAME TO refresh_catalog_read_models;
DROP FUNCTION refresh_catalog_delivery_order(SMALLINT);
DROP TABLE catalog_delivery_order;
DROP TABLE catalog_delivery_state;
ALTER TABLE catalog_library_dataset_definitions DROP COLUMN default_order;
