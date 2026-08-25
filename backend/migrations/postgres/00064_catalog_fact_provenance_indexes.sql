-- +goose NO TRANSACTION
-- +goose Up
CREATE INDEX CONCURRENTLY catalog_quest_rewards_artifact_idx ON catalog_quest_rewards(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_npc_roles_artifact_idx ON catalog_npc_roles(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_npc_locations_artifact_idx ON catalog_npc_locations(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_item_acquisition_sources_artifact_idx ON catalog_item_acquisition_sources(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_item_effects_artifact_idx ON catalog_item_effects(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_spell_effects_artifact_idx ON catalog_spell_effects(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_profession_recipes_artifact_idx ON catalog_profession_recipes(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_recipe_reagents_artifact_idx ON catalog_recipe_reagents(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_recipe_currencies_artifact_idx ON catalog_recipe_currencies(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_recipe_outputs_artifact_idx ON catalog_recipe_outputs(source_artifact_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX CONCURRENTLY catalog_item_variant_effects_artifact_idx ON catalog_item_variant_effects(source_artifact_id) WHERE source_artifact_id IS NOT NULL;

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS catalog_item_variant_effects_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_recipe_outputs_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_recipe_currencies_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_recipe_reagents_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_profession_recipes_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_spell_effects_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_item_effects_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_item_acquisition_sources_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_npc_locations_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_npc_roles_artifact_idx;
DROP INDEX CONCURRENTLY IF EXISTS catalog_quest_rewards_artifact_idx;
