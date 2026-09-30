-- +goose Up
CREATE TABLE wow_character_workspace_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_subject_hash BYTEA NOT NULL CHECK (octet_length(account_subject_hash) = 32),
    character_slug TEXT NOT NULL CHECK (character_slug ~ '^[a-z0-9%-]+--[a-z0-9%-]+--[^[:space:]/?#]{1,128}$'),
    specialization_slug TEXT NOT NULL CHECK (specialization_slug ~ '^[a-z0-9-]{2,64}$'),
    document_kind TEXT NOT NULL CHECK (document_kind IN (
        'talent-builds', 'rotation-studio', 'trainer-settings', 'gear-owned', 'character-settings'
    )),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) IN ('object', 'array')),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    last_mutation_id TEXT NOT NULL CHECK (char_length(last_mutation_id) BETWEEN 8 AND 128),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_subject_hash, character_slug, specialization_slug, document_kind)
);

CREATE INDEX wow_character_workspace_account_idx
    ON wow_character_workspace_documents (account_subject_hash, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE wow_character_workspace_versions (
    document_id UUID NOT NULL REFERENCES wow_character_workspace_documents(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) IN ('object', 'array')),
    mutation_id TEXT NOT NULL CHECK (char_length(mutation_id) BETWEEN 8 AND 128),
    deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, revision)
);

CREATE TABLE wow_character_workspace_migrations (
    account_subject_hash BYTEA NOT NULL CHECK (octet_length(account_subject_hash) = 32),
    migration_key TEXT NOT NULL CHECK (char_length(migration_key) BETWEEN 8 AND 128),
    imported_documents INTEGER NOT NULL DEFAULT 0 CHECK (imported_documents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_subject_hash, migration_key)
);

COMMENT ON TABLE wow_character_workspace_documents IS 'Battle.net account-scoped character workspace documents with optimistic revisions.';
COMMENT ON TABLE wow_character_workspace_versions IS 'Immutable confirmed versions retained so a concurrent write cannot erase the last accepted state.';
COMMENT ON TABLE wow_character_workspace_migrations IS 'Idempotency ledger for one-time browser localStorage imports.';
COMMENT ON COLUMN wow_character_workspace_documents.deleted_at IS 'Soft-deleted documents are purged after 30 days on the next account workspace read.';
COMMENT ON COLUMN wow_character_workspace_versions.created_at IS 'Conflict history keeps at most 50 revisions and 90 days per document.';

-- +goose Down
DROP TABLE IF EXISTS wow_character_workspace_migrations;
DROP TABLE IF EXISTS wow_character_workspace_versions;
DROP TABLE IF EXISTS wow_character_workspace_documents;
