-- +goose Up
-- Exact, source-backed references found in localized entity descriptions. The
-- source version keeps the mention build-aware while target_entity_id provides
-- a stable link to the current public entity representation.
CREATE TABLE catalog_entity_mentions (
    source_version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    target_entity_id UUID NOT NULL REFERENCES game_entities(id) ON DELETE CASCADE,
    mention_text TEXT NOT NULL CHECK (length(btrim(mention_text)) BETWEEN 2 AND 100),
    source TEXT NOT NULL CHECK (source IN ('verified_description_exact')),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (source_version_id, locale, target_entity_id, mention_text, source)
);

CREATE INDEX catalog_entity_mentions_target_idx
    ON catalog_entity_mentions (target_entity_id, locale, source_version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_entity_mentions;
