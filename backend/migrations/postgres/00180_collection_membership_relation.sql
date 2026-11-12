-- +goose Up
-- Collection membership uses the existing item -> set belongs_to relation.
-- Extend the registry for the new collection spell/item/class relationships.
UPDATE catalog_relation_types SET allowed_source_types=ARRAY(SELECT DISTINCT unnest(allowed_source_types||ARRAY['mount','battle_pet','item_set'])) WHERE relation_type='grants';
UPDATE catalog_relation_types SET allowed_target_types=ARRAY(SELECT DISTINCT unnest(allowed_target_types||ARRAY['item'])) WHERE relation_type='obtained_from';
UPDATE catalog_relation_types SET allowed_source_types=ARRAY(SELECT DISTINCT unnest(allowed_source_types||ARRAY['transmog_set'])) WHERE relation_type='owned_by';

-- +goose Down
-- Projected facts are candidate-build data; rollback selects the previous
-- release. Removing registry additions never deletes published relationships.
UPDATE catalog_relation_types SET allowed_source_types=array_remove(array_remove(array_remove(allowed_source_types,'mount'),'battle_pet'),'item_set') WHERE relation_type='grants';
UPDATE catalog_relation_types SET allowed_target_types=array_remove(allowed_target_types,'item') WHERE relation_type='obtained_from';
UPDATE catalog_relation_types SET allowed_source_types=array_remove(allowed_source_types,'transmog_set') WHERE relation_type='owned_by';
