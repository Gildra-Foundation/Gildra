-- +goose Up
-- Localized values can be composed from more than one immutable source
-- artifact (for example Wago SpellName plus Spell). Preserve every input so
-- localization provenance can be audited independently from the canonical
-- entity version.
CREATE TABLE catalog_entity_localization_artifacts (
    version_id UUID NOT NULL,
    locale TEXT NOT NULL,
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, locale, source_artifact_id),
    FOREIGN KEY (version_id, locale)
        REFERENCES game_entity_localizations(version_id, locale) ON DELETE CASCADE
);

CREATE INDEX catalog_entity_localization_artifacts_source_idx
    ON catalog_entity_localization_artifacts (source_artifact_id, version_id, locale);

-- +goose Down
DROP TABLE IF EXISTS catalog_entity_localization_artifacts;
