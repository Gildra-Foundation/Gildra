-- +goose Up
-- One immutable entity version can be observed in multiple source artifacts.
-- Keep those observations separately so a complete artifact can prove bytes
-- first seen during a bounded diagnostic without duplicating the version or
-- mutating its original snapshot provenance.
CREATE TABLE catalog_entity_version_artifacts (
    version_id UUID NOT NULL REFERENCES game_entity_versions(id) ON DELETE CASCADE,
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, source_artifact_id)
);

CREATE INDEX catalog_entity_version_artifacts_source_idx
    ON catalog_entity_version_artifacts (source_artifact_id, version_id);

-- +goose Down
DROP TABLE IF EXISTS catalog_entity_version_artifacts;
