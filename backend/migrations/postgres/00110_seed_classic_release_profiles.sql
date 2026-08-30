-- +goose Up
-- Classic products use the same build-pinned DB2/listfile evidence model as
-- Retail, but each product has its own identity space and release pointer.
-- Keeping the profiles in the database makes readiness and publication checks
-- data-driven instead of silently treating every product as Retail.
WITH profiles(profile_key, product_slug, display_name, description) AS (VALUES
    ('classic-foundation-v1','wow_classic','World of Warcraft Classic foundation v1',
        'Build-pinned Classic catalog from DB2 and the verified listfile.'),
    ('classic-era-foundation-v1','wow_classic_era','World of Warcraft Classic Era foundation v1',
        'Build-pinned Classic Era catalog from DB2 and the verified listfile.'),
    ('classic-hardcore-foundation-v1','wow_classic_hardcore','World of Warcraft Classic Hardcore foundation v1',
        'Independent build-pinned Hardcore catalog from DB2 and the verified listfile.')
)
INSERT INTO catalog_release_profiles(
    profile_key,product_id,display_name,status,pipeline_sources,publication_sources,locales,description
)
SELECT profile.profile_key,product.id,profile.display_name,'active',
    ARRAY['db2','listfile'],ARRAY['wago_tools','wow_listfile'],ARRAY['en_US','ru_RU'],profile.description
FROM profiles profile
JOIN game_products product ON product.slug=profile.product_slug
ON CONFLICT (profile_key) DO UPDATE SET
    product_id=EXCLUDED.product_id,
    display_name=EXCLUDED.display_name,
    status=EXCLUDED.status,
    pipeline_sources=EXCLUDED.pipeline_sources,
    publication_sources=EXCLUDED.publication_sources,
    locales=EXCLUDED.locales,
    description=EXCLUDED.description,
    updated_at=now();

WITH profile_types(profile_key, entity_type, requirement, minimum_count, notes) AS (VALUES
    ('classic-foundation-v1','achievement','required',1::bigint,''),
    ('classic-foundation-v1','area','required',1::bigint,''),
    ('classic-foundation-v1','battle_pet','required',1::bigint,''),
    ('classic-foundation-v1','class','required',1::bigint,''),
    ('classic-foundation-v1','creature','required',1::bigint,'NPC identities; role and location coverage is gated separately.'),
    ('classic-foundation-v1','currency','required',1::bigint,''),
    ('classic-foundation-v1','faction','required',1::bigint,''),
    ('classic-foundation-v1','instance','required',1::bigint,''),
    ('classic-foundation-v1','item','required',1::bigint,'Weapons, armor, reagents and consumables.'),
    ('classic-foundation-v1','map','required',1::bigint,''),
    ('classic-foundation-v1','mount','required',1::bigint,''),
    ('classic-foundation-v1','profession','required',1::bigint,''),
    ('classic-foundation-v1','quest','required',1::bigint,''),
    ('classic-foundation-v1','recipe','required',1::bigint,''),
    ('classic-foundation-v1','specialization','optional',0::bigint,''),
    ('classic-foundation-v1','spell','required',1::bigint,''),
    ('classic-foundation-v1','toy','optional',0::bigint,''),
    ('classic-foundation-v1','encounter','optional',0::bigint,''),
    ('classic-era-foundation-v1','achievement','required',1::bigint,''),
    ('classic-era-foundation-v1','area','required',1::bigint,''),
    ('classic-era-foundation-v1','battle_pet','required',1::bigint,''),
    ('classic-era-foundation-v1','class','required',1::bigint,''),
    ('classic-era-foundation-v1','creature','required',1::bigint,'NPC identities; role and location coverage is gated separately.'),
    ('classic-era-foundation-v1','currency','required',1::bigint,''),
    ('classic-era-foundation-v1','faction','required',1::bigint,''),
    ('classic-era-foundation-v1','instance','required',1::bigint,''),
    ('classic-era-foundation-v1','item','required',1::bigint,'Weapons, armor, reagents and consumables.'),
    ('classic-era-foundation-v1','map','required',1::bigint,''),
    ('classic-era-foundation-v1','mount','required',1::bigint,''),
    ('classic-era-foundation-v1','profession','required',1::bigint,''),
    ('classic-era-foundation-v1','quest','required',1::bigint,''),
    ('classic-era-foundation-v1','recipe','required',1::bigint,''),
    ('classic-era-foundation-v1','spell','required',1::bigint,''),
    ('classic-era-foundation-v1','toy','optional',0::bigint,''),
    ('classic-era-foundation-v1','encounter','optional',0::bigint,''),
    ('classic-hardcore-foundation-v1','achievement','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','area','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','battle_pet','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','class','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','creature','required',1::bigint,'NPC identities; role and location coverage is gated separately.'),
    ('classic-hardcore-foundation-v1','currency','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','faction','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','instance','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','item','required',1::bigint,'Weapons, armor, reagents and consumables.'),
    ('classic-hardcore-foundation-v1','map','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','mount','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','profession','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','quest','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','recipe','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','spell','required',1::bigint,''),
    ('classic-hardcore-foundation-v1','toy','optional',0::bigint,''),
    ('classic-hardcore-foundation-v1','encounter','optional',0::bigint,'')
)
INSERT INTO catalog_release_profile_entity_types(profile_key,entity_type,requirement,minimum_count,notes)
SELECT profile_key,entity_type,requirement,minimum_count,notes FROM profile_types
ON CONFLICT (profile_key,entity_type) DO UPDATE SET
    requirement=EXCLUDED.requirement,
    minimum_count=EXCLUDED.minimum_count,
    notes=EXCLUDED.notes;

-- +goose Down
DELETE FROM catalog_release_profiles
WHERE profile_key IN ('classic-foundation-v1','classic-era-foundation-v1','classic-hardcore-foundation-v1');
