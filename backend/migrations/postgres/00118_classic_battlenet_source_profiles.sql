-- +goose Up
-- Classic, Classic Era and Hardcore have their own build-pinned Blizzard
-- namespaces.  Keep those official records in the same release profile as
-- DB2/listfile so the importer can enrich registry-only quests, localized
-- text and official media without sharing identities between products.
UPDATE catalog_release_profiles
SET pipeline_sources=ARRAY['db2','battlenet','listfile'],
    publication_sources=ARRAY['wago_tools','blizzard_api','wow_listfile'],
    description=CASE profile_key
        WHEN 'classic-foundation-v1' THEN
            'Build-pinned Classic catalog from DB2, official Blizzard API and the verified listfile.'
        WHEN 'classic-era-foundation-v1' THEN
            'Build-pinned Classic Era catalog from DB2, official Blizzard API and the verified listfile.'
        WHEN 'classic-hardcore-foundation-v1' THEN
            'Independent build-pinned Hardcore catalog from DB2, official Blizzard API and the verified listfile.'
        ELSE description
    END,
    updated_at=now()
WHERE profile_key IN (
    'classic-foundation-v1',
    'classic-era-foundation-v1',
    'classic-hardcore-foundation-v1'
);

-- +goose Down
UPDATE catalog_release_profiles
SET pipeline_sources=ARRAY['db2','listfile'],
    publication_sources=ARRAY['wago_tools','wow_listfile'],
    description=CASE profile_key
        WHEN 'classic-foundation-v1' THEN
            'Build-pinned Classic catalog from DB2 and the verified listfile.'
        WHEN 'classic-era-foundation-v1' THEN
            'Build-pinned Classic Era catalog from DB2 and the verified listfile.'
        WHEN 'classic-hardcore-foundation-v1' THEN
            'Independent build-pinned Hardcore catalog from DB2 and the verified listfile.'
        ELSE description
    END,
    updated_at=now()
WHERE profile_key IN (
    'classic-foundation-v1',
    'classic-era-foundation-v1',
    'classic-hardcore-foundation-v1'
);
