-- +goose Up
ALTER TABLE catalog_spell_effects
    DROP CONSTRAINT catalog_spell_effects_chain_targets_check;

-- DB2 uses negative sentinel values for effects whose target count is resolved elsewhere.
ALTER TABLE catalog_spell_effects
    ADD CONSTRAINT catalog_spell_effects_chain_targets_check CHECK (chain_targets >= -1);

-- +goose Down
ALTER TABLE catalog_spell_effects
    DROP CONSTRAINT catalog_spell_effects_chain_targets_check;
ALTER TABLE catalog_spell_effects
    ADD CONSTRAINT catalog_spell_effects_chain_targets_check CHECK (chain_targets >= 0);
