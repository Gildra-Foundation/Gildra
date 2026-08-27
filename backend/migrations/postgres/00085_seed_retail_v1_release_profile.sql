-- +goose Up
INSERT INTO catalog_release_profiles(
    profile_key,product_id,display_name,status,pipeline_sources,publication_sources,locales,description
)
SELECT
    'retail-foundation-v1',id,'World of Warcraft Retail foundation v1','active',
    ARRAY['wago','db2','battlenet','listfile'],
    ARRAY['wago_tools','blizzard_api','wow_listfile'],
    ARRAY['en_US','ru_RU'],
    'Structured Retail catalog only. Tier lists, rankings, Classic, Classic Era and Hardcore are outside this release profile.'
FROM game_products WHERE slug='wow'
ON CONFLICT (profile_key) DO UPDATE SET
    product_id=EXCLUDED.product_id,
    display_name=EXCLUDED.display_name,
    status=EXCLUDED.status,
    pipeline_sources=EXCLUDED.pipeline_sources,
    publication_sources=EXCLUDED.publication_sources,
    locales=EXCLUDED.locales,
    description=EXCLUDED.description,
    updated_at=now();

WITH profile_types(entity_type,requirement,minimum_count,notes) AS (VALUES
    ('achievement','required',1::bigint,''),
    ('area','required',1::bigint,''),
    ('battle_pet','required',1::bigint,''),
    ('class','required',1::bigint,''),
    ('creature','required',1::bigint,'Includes NPC identities; role and location coverage is measured separately.'),
    ('currency','required',1::bigint,''),
    ('encounter','required',1::bigint,''),
    ('faction','required',1::bigint,''),
    ('instance','required',1::bigint,''),
    ('item','required',1::bigint,'Armor, weapons, reagents and consumables are classified within item facts and categories.'),
    ('map','required',1::bigint,''),
    ('mount','required',1::bigint,''),
    ('profession','required',1::bigint,''),
    ('pvp_talent','required',1::bigint,''),
    ('quest','required',1::bigint,''),
    ('recipe','required',1::bigint,''),
    ('specialization','required',1::bigint,''),
    ('spell','required',1::bigint,'Includes the build-pinned spell mechanics foundation.'),
    ('toy','required',1::bigint,''),
    ('transmog_set','required',1::bigint,''),
    ('talent','deferred',0::bigint,'Canonical talent entities are deferred until their denominator and build mapping are proven.'),
    ('talent_tree','deferred',0::bigint,'Deferred with canonical talent entities.'),
    ('item_set','optional',0::bigint,'May be represented through item categories until a complete first-class denominator exists.'),
    ('gem','optional',0::bigint,'Represented through item facts and categories in v1.'),
    ('enchantment','optional',0::bigint,'Represented through item and spell facts in v1.'),
    ('food','optional',0::bigint,'Represented through item facts and categories in v1.'),
    ('flask','optional',0::bigint,'Represented through item facts and categories in v1.'),
    ('potion','optional',0::bigint,'Represented through item facts and categories in v1.'),
    ('season','optional',0::bigint,'Not required for the structured data foundation launch.')
)
INSERT INTO catalog_release_profile_entity_types(profile_key,entity_type,requirement,minimum_count,notes)
SELECT 'retail-foundation-v1',entity_type,requirement,minimum_count,notes FROM profile_types
ON CONFLICT (profile_key,entity_type) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    minimum_count=EXCLUDED.minimum_count,
    notes=EXCLUDED.notes;

-- +goose Down
DELETE FROM catalog_release_profiles WHERE profile_key='retail-foundation-v1';
