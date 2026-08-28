-- +goose Up
-- ATT map references and NPC coordinate payloads use UiMap identifiers. DB2
-- Map identifiers describe a different client table, so keep both canonical
-- types instead of resolving two incompatible ID spaces into `map`.
UPDATE catalog_source_entity_type_mappings
SET canonical_entity_type='ui_map',updated_at=now()
WHERE source='all_the_things' AND source_type='map'
  AND disposition='resolve' AND canonical_entity_type='map';

-- A mapping change cannot retain previous targets: those UUIDs point at the
-- numerically colliding DB2 Map ID space. The next resolver run will classify
-- every affected row against ui_map from scratch.
UPDATE catalog_staged_source_references reference
SET target_entity_id=NULL,resolution_status='pending',
    resolution_reason='canonical_type_mapping_changed',updated_at=now()
FROM catalog_staged_source_nodes node
WHERE node.id=reference.node_id AND node.source='all_the_things'
  AND reference.target_type='map';

UPDATE catalog_staged_source_nodes
SET resolved_entity_id=NULL,resolution_status='pending',
    resolution_reason='canonical_type_mapping_changed',updated_at=now()
WHERE source='all_the_things' AND node_kind='map';

INSERT INTO catalog_entity_type_registry(
    product_id,entity_type,group_key,icon_symbol,sort_order,is_public,attributes
)
SELECT product.id,'ui_map','world','#ic-map',425,true,
    '{"id_space":"UiMap","source_table":"UiMap"}'::jsonb
FROM game_products product
ON CONFLICT(product_id,entity_type) DO UPDATE SET
    group_key=EXCLUDED.group_key,
    icon_symbol=EXCLUDED.icon_symbol,
    sort_order=EXCLUDED.sort_order,
    is_public=EXCLUDED.is_public,
    attributes=catalog_entity_type_registry.attributes || EXCLUDED.attributes,
    updated_at=now();

INSERT INTO catalog_entity_type_localizations(
    product_id,entity_type,locale,name,description
)
SELECT product.id,localized.entity_type,localized.locale,localized.name,localized.description
FROM game_products product
CROSS JOIN (VALUES
    ('ui_map'::text,'en_US'::text,'Client maps'::text,
        'User-interface maps used by coordinates, zones and navigation.'::text),
    ('ui_map','ru_RU','Карты интерфейса',
        'Карты игрового интерфейса, используемые координатами, зонами и навигацией.')
) localized(entity_type,locale,name,description)
ON CONFLICT(product_id,entity_type,locale) DO UPDATE SET
    name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO catalog_library_dataset_definitions(
    slug,entity_type,category_path,item_class_id,group_key,icon_symbol,sort_order
) VALUES ('ui-maps','ui_map','',NULL,'world','#ic-map',425)
ON CONFLICT(slug) DO UPDATE SET
    entity_type=EXCLUDED.entity_type,
    category_path=EXCLUDED.category_path,
    item_class_id=EXCLUDED.item_class_id,
    group_key=EXCLUDED.group_key,
    icon_symbol=EXCLUDED.icon_symbol,
    sort_order=EXCLUDED.sort_order,
    is_public=true,
    updated_at=now();

INSERT INTO catalog_library_dataset_localizations(dataset_slug,locale,name,description) VALUES
    ('ui-maps','en_US','Client maps','Maps used by the game UI, coordinates and navigation'),
    ('ui-maps','ru_RU','Карты интерфейса','Карты игрового интерфейса, координат и навигации')
ON CONFLICT(dataset_slug,locale) DO UPDATE SET
    name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO catalog_library_dataset_applicability(
    dataset_slug,product_id,status,reason_en,reason_ru
)
SELECT 'ui-maps',product.id,'applicable','',''
FROM game_products product
ON CONFLICT(dataset_slug,product_id) DO UPDATE SET
    status='applicable',reason_en='',reason_ru='',reviewed_at=now();

INSERT INTO catalog_release_profile_entity_types(
    profile_key,entity_type,requirement,minimum_count,notes
) VALUES (
    'retail-foundation-v1','ui_map','required',1,
    'Client UiMap identity space used by ATT references and normalized coordinates.'
)
ON CONFLICT(profile_key,entity_type) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    minimum_count=EXCLUDED.minimum_count,
    notes=EXCLUDED.notes;

SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
DELETE FROM catalog_release_profile_entity_types
WHERE profile_key='retail-foundation-v1' AND entity_type='ui_map';
DELETE FROM catalog_library_dataset_definitions WHERE slug='ui-maps';
DELETE FROM catalog_entity_type_localizations WHERE entity_type='ui_map';
DELETE FROM catalog_entity_type_registry WHERE entity_type='ui_map';
UPDATE catalog_staged_source_references reference
SET target_entity_id=NULL,resolution_status='pending',
    resolution_reason='canonical_type_mapping_changed',updated_at=now()
FROM catalog_staged_source_nodes node
WHERE node.id=reference.node_id AND node.source='all_the_things'
  AND reference.target_type='map';
UPDATE catalog_staged_source_nodes
SET resolved_entity_id=NULL,resolution_status='pending',
    resolution_reason='canonical_type_mapping_changed',updated_at=now()
WHERE source='all_the_things' AND node_kind='map';
UPDATE catalog_source_entity_type_mappings
SET canonical_entity_type='map',updated_at=now()
WHERE source='all_the_things' AND source_type='map'
  AND disposition='resolve' AND canonical_entity_type='ui_map';
SELECT refresh_catalog_library_datasets(NULL);
