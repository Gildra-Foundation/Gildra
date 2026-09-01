-- +goose Up
-- Classic Era and Hardcore do not contain the retail battle-pet collection
-- system.  The library applicability migration already labels that dataset
-- not_applicable; align the release profiles so a zero battle_pet entity count
-- does not block an otherwise valid Era/Hardcore import.  Mounts and
-- currencies remain required because those systems are applicable and are
-- still pending a complete source-backed import.
UPDATE catalog_release_profile_entity_types
SET requirement='optional', minimum_count=0,
    notes='The Classic Era client does not use the retail battle-pet collection system.'
WHERE profile_key IN ('classic-era-foundation-v1','classic-hardcore-foundation-v1')
  AND entity_type='battle_pet';

-- +goose Down
UPDATE catalog_release_profile_entity_types
SET requirement='required', minimum_count=1, notes=''
WHERE profile_key IN ('classic-era-foundation-v1','classic-hardcore-foundation-v1')
  AND entity_type='battle_pet';
