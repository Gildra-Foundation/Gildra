-- +goose Up
ALTER TABLE catalog_spell_effects
    DROP CONSTRAINT catalog_spell_effects_chain_targets_check;
ALTER TABLE catalog_spell_effects
    ADD CONSTRAINT catalog_spell_effects_chain_targets_check CHECK (chain_targets BETWEEN -10 AND 1000);

-- +goose Down
ALTER TABLE catalog_spell_effects
    DROP CONSTRAINT catalog_spell_effects_chain_targets_check;
ALTER TABLE catalog_spell_effects
    ADD CONSTRAINT catalog_spell_effects_chain_targets_check CHECK (chain_targets >= -1);
