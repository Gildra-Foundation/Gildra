-- +goose Up
-- Account-wide builds are separate from character-scoped workspace documents.
CREATE TABLE wow_mythic_talent_builds (
    account_hash BYTEA NOT NULL CHECK (octet_length(account_hash) = 32),
    id UUID NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    code_hash BYTEA NOT NULL CHECK (octet_length(code_hash) = 32),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    last_mutation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (account_hash, id),
    CHECK (deleted_at IS NOT NULL OR (char_length(name) BETWEEN 1 AND 64 AND octet_length(code) BETWEEN 26 AND 4096 AND code ~ '^[A-Za-z0-9+/]+$'))
);
CREATE UNIQUE INDEX wow_mythic_talent_builds_active_code_idx
    ON wow_mythic_talent_builds(account_hash, code_hash) WHERE deleted_at IS NULL;
COMMENT ON TABLE wow_mythic_talent_builds IS 'Private Battle.net account talent builds; serialized account writes enforce the 20-active-build bound. Deleted IDs/revisions remain as tombstones; their name/code are erased.';
-- +goose Down
DROP TABLE IF EXISTS wow_mythic_talent_builds;
