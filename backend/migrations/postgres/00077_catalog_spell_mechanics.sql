-- +goose Up
-- Keep numeric spell mechanics queryable while preserving the legacy display
-- strings used by existing API clients. Each promoted field records the exact
-- immutable DB2 artifact that supplied it.
ALTER TABLE catalog_spells
    ADD COLUMN school_mask INTEGER CHECK (school_mask IS NULL OR school_mask >= 0),
    ADD COLUMN cast_time_ms INTEGER CHECK (cast_time_ms IS NULL OR cast_time_ms >= 0),
    ADD COLUMN misc_source_artifact_id UUID,
    ADD COLUMN cast_time_source_artifact_id UUID,
    ADD COLUMN cooldown_source_artifact_id UUID,
    ADD COLUMN range_source_artifact_id UUID;

ALTER TABLE catalog_spells
    ADD CONSTRAINT catalog_spells_misc_source_artifact_fk
    FOREIGN KEY (misc_source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT catalog_spells_cast_time_source_artifact_fk
    FOREIGN KEY (cast_time_source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT catalog_spells_cooldown_source_artifact_fk
    FOREIGN KEY (cooldown_source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT catalog_spells_range_source_artifact_fk
    FOREIGN KEY (range_source_artifact_id) REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL NOT VALID;

-- +goose Down
ALTER TABLE catalog_spells
    DROP CONSTRAINT IF EXISTS catalog_spells_range_source_artifact_fk,
    DROP CONSTRAINT IF EXISTS catalog_spells_cooldown_source_artifact_fk,
    DROP CONSTRAINT IF EXISTS catalog_spells_cast_time_source_artifact_fk,
    DROP CONSTRAINT IF EXISTS catalog_spells_misc_source_artifact_fk,
    DROP COLUMN IF EXISTS range_source_artifact_id,
    DROP COLUMN IF EXISTS cooldown_source_artifact_id,
    DROP COLUMN IF EXISTS cast_time_source_artifact_id,
    DROP COLUMN IF EXISTS misc_source_artifact_id,
    DROP COLUMN IF EXISTS cast_time_ms,
    DROP COLUMN IF EXISTS school_mask;
