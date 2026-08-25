-- +goose Up
-- Preserve source-specific documents independently from the canonical entity
-- version. This allows official API enrichment without replacing build-pinned
-- DB2 facts that are normalized against an existing version_id.
CREATE TABLE catalog_entity_source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT NOT NULL CHECK (external_id > 0),
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    locale TEXT NOT NULL,
    payload JSONB NOT NULL,
    content_hash BYTEA NOT NULL,
    source_url TEXT NOT NULL,
    source_artifact_id UUID REFERENCES catalog_source_artifacts(id) ON DELETE SET NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (build_id, entity_type, external_id, source, locale)
);

CREATE INDEX catalog_entity_source_documents_entity_idx
    ON catalog_entity_source_documents (entity_type, external_id, build_id);

CREATE INDEX catalog_entity_source_documents_artifact_idx
    ON catalog_entity_source_documents (source_artifact_id)
    WHERE source_artifact_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS catalog_entity_source_documents;
