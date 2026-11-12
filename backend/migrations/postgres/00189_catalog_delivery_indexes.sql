-- +goose NO TRANSACTION
-- +goose Up
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_order_identity_idx ON catalog_delivery_order(product_id,locale,entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_current_idx ON catalog_delivery_order
 (product_id,locale,entity_type,expansion_order DESC,(COALESCE(item_level,-1)) DESC,external_id DESC,entity_id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_item_level_idx ON catalog_delivery_order
 (product_id,locale,entity_type,(COALESCE(item_level,-1)),entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_required_level_idx ON catalog_delivery_order
 (product_id,locale,entity_type,(COALESCE(required_level,-1)),entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_name_idx ON catalog_delivery_order
 (product_id,locale,entity_type,name COLLATE "C",entity_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_state_product_idx ON catalog_delivery_state(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_current_all_idx ON catalog_delivery_order
 (product_id,locale,expansion_order DESC,(COALESCE(item_level,-1)) DESC,external_id DESC,entity_id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_item_level_all_idx ON catalog_delivery_order
 (product_id,locale,(COALESCE(item_level,-1)),entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_required_level_all_idx ON catalog_delivery_order
 (product_id,locale,(COALESCE(required_level,-1)),entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_name_all_idx ON catalog_delivery_order
 (product_id,locale,name COLLATE "C",entity_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_name_search_idx ON catalog_delivery_order USING GIN(name_search);
CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_delivery_current_class_idx ON catalog_delivery_order
 (product_id,locale,entity_type,item_class_id,expansion_order DESC,(COALESCE(item_level,-1)) DESC,external_id DESC,entity_id DESC)
 WHERE entity_type='item';
-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_current_class_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_name_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_name_all_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_required_level_all_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_item_level_all_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_current_all_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_state_product_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_name_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_required_level_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_item_level_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_current_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_delivery_order_identity_idx;
