-- +goose Up
-- Non-official relationship sources are parsed into a fail-closed staging
-- graph first. Nothing in these tables is exposed by the public catalog or
-- considered by release publication checks until a separate reviewed
-- projection explicitly resolves and approves it.
CREATE TABLE catalog_staged_source_nodes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    build_id BIGINT NOT NULL REFERENCES game_builds(id) ON DELETE CASCADE,
    source TEXT NOT NULL REFERENCES catalog_source_policies(source),
    source_artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE RESTRICT,
    record_key TEXT NOT NULL CHECK (btrim(record_key) <> ''),
    parent_record_key TEXT CHECK (parent_record_key IS NULL OR btrim(parent_record_key) <> ''),
    node_kind TEXT NOT NULL CHECK (node_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
    external_id BIGINT CHECK (external_id IS NULL OR external_id > 0),
    source_line INTEGER NOT NULL CHECK (source_line > 0),
    ancestor_path JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ancestor_path) = 'array'),
    fields JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
    raw_source TEXT NOT NULL CHECK (btrim(raw_source) <> ''),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    resolution_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (resolution_status IN ('pending','resolved','unresolved','ambiguous','excluded')),
    resolved_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    resolution_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_artifact_id, record_key),
    CHECK (resolution_status <> 'resolved' OR resolved_entity_id IS NOT NULL)
);

CREATE INDEX catalog_staged_source_nodes_lookup_idx
    ON catalog_staged_source_nodes (source, build_id, node_kind, external_id);
CREATE INDEX catalog_staged_source_nodes_resolution_idx
    ON catalog_staged_source_nodes (source, build_id, resolution_status, id);
CREATE INDEX catalog_staged_source_nodes_entity_idx
    ON catalog_staged_source_nodes (resolved_entity_id, build_id)
    WHERE resolved_entity_id IS NOT NULL;

CREATE TABLE catalog_staged_source_references (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id BIGINT NOT NULL REFERENCES catalog_staged_source_nodes(id) ON DELETE CASCADE,
    reference_kind TEXT NOT NULL CHECK (reference_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
    target_type TEXT NOT NULL CHECK (target_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    target_external_id BIGINT NOT NULL CHECK (target_external_id > 0),
    ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
    target_entity_id UUID REFERENCES game_entities(id) ON DELETE SET NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (node_id, reference_kind, target_type, target_external_id, ordinal)
);

CREATE INDEX catalog_staged_source_references_target_idx
    ON catalog_staged_source_references (target_type, target_external_id, reference_kind, node_id);
CREATE INDEX catalog_staged_source_references_entity_idx
    ON catalog_staged_source_references (target_entity_id, reference_kind)
    WHERE target_entity_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS catalog_staged_source_references;
DROP TABLE IF EXISTS catalog_staged_source_nodes;
