-- +goose Up
-- QuestPackageItem describes source-backed reward packages, but PackageID is
-- not a QuestID. Publish the package as its own identity so every imported row
-- remains visible without inventing a quest-to-package relationship.
INSERT INTO catalog_entity_type_registry(
    product_id,entity_type,group_key,icon_symbol,sort_order,is_public,attributes
)
SELECT product.id,'quest_reward_package','world','#ic-bag',405,true,
    '{"source_table":"QuestPackageItem","relationship_status":"package_only"}'::jsonb
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
    ('quest_reward_package'::text,'en_US'::text,'Quest reward packages'::text,
        'Client-defined item packages. A package is not linked to a quest unless a separate proved relationship exists.'::text),
    ('quest_reward_package','ru_RU','Пакеты наград за задания',
        'Наборы предметов из клиента. Пакет не связывается с заданием без отдельного подтверждённого источника связи.')
) localized(entity_type,locale,name,description)
ON CONFLICT(product_id,entity_type,locale) DO UPDATE SET
    name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO catalog_library_dataset_definitions(
    slug,entity_type,category_path,item_class_id,group_key,icon_symbol,sort_order
) VALUES ('quest-reward-packages','quest_reward_package','',NULL,'world','#ic-bag',405)
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
    ('quest-reward-packages','en_US','Quest reward packages',
        'Verified client item packages, quantities and display modes'),
    ('quest-reward-packages','ru_RU','Пакеты наград за задания',
        'Подтверждённые клиентом наборы предметов, количества и режимы отображения')
ON CONFLICT(dataset_slug,locale) DO UPDATE SET
    name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO catalog_library_dataset_applicability(
    dataset_slug,product_id,status,reason_en,reason_ru
)
SELECT 'quest-reward-packages',product.id,
    CASE WHEN product.slug IN ('wow','wow_classic') THEN 'applicable' ELSE 'pending_source' END,
    CASE WHEN product.slug IN ('wow','wow_classic') THEN ''
        ELSE 'The system is applicable, but the current client build contains no publishable QuestPackageItem rows.' END,
    CASE WHEN product.slug IN ('wow','wow_classic') THEN ''
        ELSE 'Раздел применим, но текущая сборка клиента не содержит публикуемых строк QuestPackageItem.' END
FROM game_products product
ON CONFLICT(dataset_slug,product_id) DO UPDATE SET
    status=EXCLUDED.status,
    reason_en=EXCLUDED.reason_en,
    reason_ru=EXCLUDED.reason_ru,
    reviewed_at=now();

INSERT INTO catalog_release_profile_entity_types(
    profile_key,entity_type,requirement,minimum_count,notes
) VALUES (
    'retail-foundation-v1','quest_reward_package','required',1,
    'Client reward-package identities only; a package must not be treated as a quest relationship without separate provenance.'
)
ON CONFLICT(profile_key,entity_type) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    minimum_count=EXCLUDED.minimum_count,
    notes=EXCLUDED.notes;

SELECT refresh_catalog_library_datasets(NULL);

-- +goose Down
DELETE FROM catalog_release_profile_entity_types
WHERE profile_key='retail-foundation-v1' AND entity_type='quest_reward_package';
DELETE FROM catalog_library_dataset_definitions WHERE slug='quest-reward-packages';
DELETE FROM catalog_entity_type_localizations WHERE entity_type='quest_reward_package';
DELETE FROM catalog_entity_type_registry WHERE entity_type='quest_reward_package';
SELECT refresh_catalog_library_datasets(NULL);
