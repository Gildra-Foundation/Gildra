-- +goose Up
INSERT INTO catalog_source_policies (
    source,display_name,homepage_url,terms_url,license_identifier,
    commercial_use_status,public_api_status,asset_caching_status,
    attribution_required,attribution_text,review_status,notes
) VALUES (
    'all_the_things','All The Things',
    'https://github.com/ATTWoWAddon/AllTheThings',
    'https://github.com/ATTWoWAddon/AllTheThings/blob/master/LICENSE',
    'MIT','unknown','unknown','unknown',true,
    'ALL THE THINGS (ATTWoWAddon)',
    'pending',
    'Candidate for item acquisition, quest, NPC, vendor, cost and recipe relations. Repository code and included files are MIT-licensed; public redistribution of derived game data still requires an explicit owner review.'
)
ON CONFLICT (source) DO NOTHING;

-- +goose Down
DELETE FROM catalog_source_policies WHERE source='all_the_things' AND review_status='pending';
