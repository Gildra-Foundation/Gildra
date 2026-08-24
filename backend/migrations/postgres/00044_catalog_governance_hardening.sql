-- +goose Up
-- Correct policy evidence for installations that already ran the original seed.
UPDATE catalog_source_policies SET
    homepage_url='https://community.developer.battle.net/',
    terms_url='https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use',
    commercial_use_status='restricted',
    public_api_status='restricted',
    asset_caching_status='restricted',
    notes='The current API terms restrict charging for applications whose features use the API. Commercial launch requires counsel and a product-specific review.',
    updated_at=now()
WHERE source='blizzard_api';

UPDATE catalog_source_policies SET
    terms_url='',
    license_identifier='NOASSERTION',
    commercial_use_status='permission_required',
    public_api_status='permission_required',
    asset_caching_status='permission_required',
    notes='No repository-level license was present at review time. Verified and community filenames have different stability; redistribution requires a separate rights review.',
    updated_at=now()
WHERE source='wow_listfile';

-- The ontology is now authoritative: an importer must register a new relation
-- before it can write links with that semantic meaning.
ALTER TABLE game_entity_links
    ADD CONSTRAINT game_entity_links_relation_type_fk
    FOREIGN KEY (relation_type) REFERENCES catalog_relation_types(relation_type)
    NOT VALID;
ALTER TABLE game_entity_links VALIDATE CONSTRAINT game_entity_links_relation_type_fk;

-- +goose Down
ALTER TABLE game_entity_links DROP CONSTRAINT IF EXISTS game_entity_links_relation_type_fk;
