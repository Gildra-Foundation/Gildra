-- +goose Up
-- Every canonical version must carry first-class provenance. Snapshot and
-- artifact links remain the detailed audit trail; source is the indexed,
-- mandatory publication-policy key.
ALTER TABLE game_entity_versions ADD COLUMN source TEXT;

UPDATE game_entity_versions version
SET source=artifact.source
FROM catalog_source_artifacts artifact
WHERE version.source_artifact_id=artifact.id AND version.source IS NULL;

UPDATE game_entity_versions version
SET source=snapshot.source
FROM catalog_snapshots snapshot
WHERE version.snapshot_id=snapshot.id AND version.source IS NULL;

UPDATE game_entity_versions SET source='wago_tools'
WHERE source IS NULL AND source_url LIKE 'https://wago.tools/%';
UPDATE game_entity_versions SET source='raidbots'
WHERE source IS NULL AND source_url LIKE 'https://www.raidbots.com/%';
UPDATE game_entity_versions SET source='blizzard_api'
WHERE source IS NULL AND source_url LIKE 'https://%api.blizzard.com/%';

-- +goose StatementBegin
CREATE FUNCTION set_game_entity_version_source() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.source IS NULL OR btrim(NEW.source) = '' THEN
        IF NEW.source_artifact_id IS NOT NULL THEN
            SELECT artifact.source INTO NEW.source
            FROM catalog_source_artifacts artifact WHERE artifact.id=NEW.source_artifact_id;
        END IF;
        IF (NEW.source IS NULL OR btrim(NEW.source) = '') AND NEW.snapshot_id IS NOT NULL THEN
            SELECT snapshot.source INTO NEW.source
            FROM catalog_snapshots snapshot WHERE snapshot.id=NEW.snapshot_id;
        END IF;
        IF NEW.source IS NULL OR btrim(NEW.source) = '' THEN
            NEW.source := CASE
                WHEN NEW.source_url LIKE 'https://wago.tools/%' THEN 'wago_tools'
                WHEN NEW.source_url LIKE 'https://www.raidbots.com/%' THEN 'raidbots'
                WHEN NEW.source_url LIKE 'https://%api.blizzard.com/%' THEN 'blizzard_api'
                ELSE NULL
            END;
        END IF;
    END IF;
    IF NEW.source IS NULL OR btrim(NEW.source) = '' THEN
        RAISE EXCEPTION 'game entity version source is required';
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER game_entity_versions_set_source
BEFORE INSERT OR UPDATE OF source,source_url,snapshot_id,source_artifact_id
ON game_entity_versions FOR EACH ROW EXECUTE FUNCTION set_game_entity_version_source();

ALTER TABLE game_entity_versions
    ADD CONSTRAINT game_entity_versions_source_present CHECK (source IS NOT NULL) NOT VALID;
ALTER TABLE game_entity_versions VALIDATE CONSTRAINT game_entity_versions_source_present;
ALTER TABLE game_entity_versions ALTER COLUMN source SET NOT NULL;
ALTER TABLE game_entity_versions DROP CONSTRAINT game_entity_versions_source_present;
ALTER TABLE game_entity_versions
    ADD CONSTRAINT game_entity_versions_source_fk
    FOREIGN KEY (source) REFERENCES catalog_source_policies(source) NOT VALID;
ALTER TABLE game_entity_versions VALIDATE CONSTRAINT game_entity_versions_source_fk;

-- +goose Down
ALTER TABLE game_entity_versions DROP CONSTRAINT IF EXISTS game_entity_versions_source_fk;
DROP TRIGGER IF EXISTS game_entity_versions_set_source ON game_entity_versions;
DROP FUNCTION IF EXISTS set_game_entity_version_source();
ALTER TABLE game_entity_versions DROP COLUMN IF EXISTS source;
