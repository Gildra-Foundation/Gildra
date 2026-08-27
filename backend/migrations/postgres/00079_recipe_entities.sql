-- +goose Up
ALTER TABLE catalog_recipes
    ADD COLUMN source_spell_version_id UUID;

ALTER TABLE catalog_recipes
    ADD CONSTRAINT catalog_recipes_source_spell_version_fk
    FOREIGN KEY (source_spell_version_id)
    REFERENCES game_entity_versions(id) ON DELETE SET NULL
    NOT VALID;

CREATE INDEX catalog_recipes_source_spell_idx
    ON catalog_recipes(source_spell_version_id)
    WHERE source_spell_version_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_recipes_source_spell_idx;
ALTER TABLE catalog_recipes
    DROP CONSTRAINT IF EXISTS catalog_recipes_source_spell_version_fk,
    DROP COLUMN IF EXISTS source_spell_version_id;
