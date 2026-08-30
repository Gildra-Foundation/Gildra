-- +goose Up
-- UiMap and Map use different client ID spaces.  Preserve only ATT map
-- resolutions that already target ui_map; a numerically colliding DB2 Map
-- target must be classified again by the resolver.
UPDATE catalog_staged_source_references reference
SET target_entity_id=NULL,resolution_status='pending',
    resolution_reason='stale_db2_map_target',updated_at=now()
FROM catalog_staged_source_nodes node,game_entities target
WHERE node.id=reference.node_id AND target.id=reference.target_entity_id
  AND node.source='all_the_things'
  AND reference.target_type='map' AND target.entity_type='map';

UPDATE catalog_staged_source_nodes node
SET resolved_entity_id=NULL,resolution_status='pending',
    resolution_reason='stale_db2_map_target',updated_at=now()
FROM game_entities target
WHERE node.source='all_the_things' AND node.node_kind='map'
  AND target.id=node.resolved_entity_id AND target.entity_type='map';

-- Project the existing dedicated UiMap dataset into the generic public read
-- model immediately. Future DB2 releases repeat this refresh and run the
-- build guard in the same publication transaction.
SELECT refresh_catalog_read_models(NULL);
SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
SELECT 1;
