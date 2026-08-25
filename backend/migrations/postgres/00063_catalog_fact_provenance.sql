-- +goose Up
-- Add direct artifact provenance to normalized facts. Nullable columns preserve
-- compatibility while importers are upgraded source by source; NOT VALID keeps
-- the deployment lock short and still checks every new write immediately.
ALTER TABLE catalog_quest_rewards
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_quest_rewards
    ADD CONSTRAINT catalog_quest_rewards_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_npc_roles
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_npc_roles
    ADD CONSTRAINT catalog_npc_roles_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_npc_locations
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_npc_locations
    ADD CONSTRAINT catalog_npc_locations_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_item_acquisition_sources
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_item_acquisition_sources
    ADD CONSTRAINT catalog_item_acquisition_sources_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_item_effects
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_item_effects
    ADD CONSTRAINT catalog_item_effects_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_spell_effects
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_spell_effects
    ADD CONSTRAINT catalog_spell_effects_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_profession_recipes
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_profession_recipes
    ADD CONSTRAINT catalog_profession_recipes_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_recipe_reagents
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_recipe_reagents
    ADD CONSTRAINT catalog_recipe_reagents_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_recipe_currencies
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_recipe_currencies
    ADD CONSTRAINT catalog_recipe_currencies_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_recipe_outputs
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_recipe_outputs
    ADD CONSTRAINT catalog_recipe_outputs_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE catalog_item_variant_effects
    ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_item_variant_effects
    ADD CONSTRAINT catalog_item_variant_effects_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

-- +goose Down
ALTER TABLE catalog_item_variant_effects DROP CONSTRAINT IF EXISTS catalog_item_variant_effects_source_artifact_fk;
ALTER TABLE catalog_item_variant_effects DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_recipe_outputs DROP CONSTRAINT IF EXISTS catalog_recipe_outputs_source_artifact_fk;
ALTER TABLE catalog_recipe_outputs DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_recipe_currencies DROP CONSTRAINT IF EXISTS catalog_recipe_currencies_source_artifact_fk;
ALTER TABLE catalog_recipe_currencies DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_recipe_reagents DROP CONSTRAINT IF EXISTS catalog_recipe_reagents_source_artifact_fk;
ALTER TABLE catalog_recipe_reagents DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_profession_recipes DROP CONSTRAINT IF EXISTS catalog_profession_recipes_source_artifact_fk;
ALTER TABLE catalog_profession_recipes DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_spell_effects DROP CONSTRAINT IF EXISTS catalog_spell_effects_source_artifact_fk;
ALTER TABLE catalog_spell_effects DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_item_effects DROP CONSTRAINT IF EXISTS catalog_item_effects_source_artifact_fk;
ALTER TABLE catalog_item_effects DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_item_acquisition_sources DROP CONSTRAINT IF EXISTS catalog_item_acquisition_sources_source_artifact_fk;
ALTER TABLE catalog_item_acquisition_sources DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_npc_locations DROP CONSTRAINT IF EXISTS catalog_npc_locations_source_artifact_fk;
ALTER TABLE catalog_npc_locations DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_npc_roles DROP CONSTRAINT IF EXISTS catalog_npc_roles_source_artifact_fk;
ALTER TABLE catalog_npc_roles DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_quest_rewards DROP CONSTRAINT IF EXISTS catalog_quest_rewards_source_artifact_fk;
ALTER TABLE catalog_quest_rewards DROP COLUMN IF EXISTS source_artifact_id;
