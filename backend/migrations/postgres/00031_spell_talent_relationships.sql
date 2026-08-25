-- +goose Up
CREATE TABLE catalog_talent_spell_links (
    talent_version_id UUID PRIMARY KEY REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    spell_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'grants' CHECK (relationship IN ('grants', 'modifies', 'replaces')),
    source TEXT NOT NULL CHECK (source IN ('raidbots', 'db2', 'blizzard_api')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX catalog_talent_spell_links_spell_idx
    ON catalog_talent_spell_links (spell_version_id, talent_version_id);

CREATE TABLE catalog_spell_owners (
    spell_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('class', 'specialization', 'race', 'profession')),
    owner_id BIGINT NOT NULL CHECK (owner_id >= 0),
    source TEXT NOT NULL CHECK (source IN ('raidbots', 'db2', 'blizzard_api')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (spell_version_id, owner_type, owner_id, source)
);
CREATE INDEX catalog_spell_owners_lookup_idx
    ON catalog_spell_owners (owner_type, owner_id, spell_version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_spell_owners;
DROP TABLE IF EXISTS catalog_talent_spell_links;
