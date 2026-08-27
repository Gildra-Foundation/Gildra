-- +goose Up
ALTER TABLE catalog_creature_displays ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_creature_display_info ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_creature_models ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_creature_taxa ADD COLUMN source_artifact_id UUID;
ALTER TABLE catalog_creature_difficulties ADD COLUMN source_artifact_id UUID;

ALTER TABLE catalog_creature_displays
    ADD CONSTRAINT catalog_creature_displays_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE catalog_creature_display_info
    ADD CONSTRAINT catalog_creature_display_info_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE catalog_creature_models
    ADD CONSTRAINT catalog_creature_models_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE catalog_creature_taxa
    ADD CONSTRAINT catalog_creature_taxa_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE catalog_creature_difficulties
    ADD CONSTRAINT catalog_creature_difficulties_source_artifact_fk
    FOREIGN KEY (source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

CREATE INDEX catalog_creature_displays_artifact_idx ON catalog_creature_displays(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_creature_display_info_artifact_idx ON catalog_creature_display_info(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_creature_models_artifact_idx ON catalog_creature_models(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_creature_taxa_artifact_idx ON catalog_creature_taxa(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;
CREATE INDEX catalog_creature_difficulties_artifact_idx ON catalog_creature_difficulties(source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_creature_difficulties_artifact_idx;
DROP INDEX IF EXISTS catalog_creature_taxa_artifact_idx;
DROP INDEX IF EXISTS catalog_creature_models_artifact_idx;
DROP INDEX IF EXISTS catalog_creature_display_info_artifact_idx;
DROP INDEX IF EXISTS catalog_creature_displays_artifact_idx;
ALTER TABLE catalog_creature_difficulties DROP CONSTRAINT IF EXISTS catalog_creature_difficulties_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_creature_taxa DROP CONSTRAINT IF EXISTS catalog_creature_taxa_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_creature_models DROP CONSTRAINT IF EXISTS catalog_creature_models_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_creature_display_info DROP CONSTRAINT IF EXISTS catalog_creature_display_info_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
ALTER TABLE catalog_creature_displays DROP CONSTRAINT IF EXISTS catalog_creature_displays_source_artifact_fk,
    DROP COLUMN IF EXISTS source_artifact_id;
