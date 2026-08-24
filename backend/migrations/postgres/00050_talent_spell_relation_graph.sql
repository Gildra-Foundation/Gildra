-- +goose Up
CREATE TABLE catalog_talent_spell_relations (
    talent_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    spell_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL CHECK (relationship IN ('grants', 'modifies', 'replaces')),
    source TEXT NOT NULL CHECK (source IN ('raidbots', 'db2', 'blizzard_api')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (talent_version_id, spell_version_id, relationship, source)
);
CREATE INDEX catalog_talent_spell_relations_spell_idx
    ON catalog_talent_spell_relations (spell_version_id, relationship, talent_version_id);

INSERT INTO catalog_talent_spell_relations(talent_version_id, spell_version_id, relationship, source, attributes)
SELECT talent_version_id, spell_version_id, relationship, source, attributes
FROM catalog_talent_spell_links
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS catalog_talent_spell_relations;
