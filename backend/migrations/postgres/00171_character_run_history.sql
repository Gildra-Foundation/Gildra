-- +goose Up
CREATE TABLE wow_character_run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_subject_hash BYTEA NOT NULL CHECK (octet_length(account_subject_hash) = 32),
    character_slug TEXT NOT NULL CHECK (character_slug ~ '^[a-z0-9%-]+--[a-z0-9%-]+--[^[:space:]/?#]{1,128}$'),
    specialization_slug TEXT NOT NULL CHECK (specialization_slug ~ '^[a-z0-9-]{2,64}$'),
    client_run_id TEXT NOT NULL CHECK (char_length(client_run_id) BETWEEN 8 AND 128),
    run_kind TEXT NOT NULL CHECK (run_kind IN ('talent', 'rotation', 'gear')),
    game_build TEXT NOT NULL CHECK (char_length(game_build) BETWEEN 1 AND 64),
    profile_fingerprint TEXT NOT NULL CHECK (char_length(profile_fingerprint) BETWEEN 1 AND 160),
    scenario JSONB NOT NULL CHECK (jsonb_typeof(scenario) = 'object'),
    engine TEXT NOT NULL CHECK (char_length(engine) BETWEEN 1 AND 120),
    metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_subject_hash, character_slug, specialization_slug, client_run_id)
);

CREATE INDEX wow_character_run_history_scope_idx
    ON wow_character_run_history (account_subject_hash, character_slug, specialization_slug, created_at DESC);

CREATE TABLE wow_character_run_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES wow_character_run_history(id) ON DELETE CASCADE,
    account_subject_hash BYTEA NOT NULL CHECK (octet_length(account_subject_hash) = 32),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    public_payload JSONB NOT NULL CHECK (jsonb_typeof(public_payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX wow_character_run_shares_owner_idx
    ON wow_character_run_shares (account_subject_hash, run_id, created_at DESC);

CREATE UNIQUE INDEX wow_character_run_shares_one_active_idx
    ON wow_character_run_shares (run_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE wow_character_run_history IS 'Account-isolated, allowlisted simulation provenance. Raw armory and OAuth data are never stored here.';
COMMENT ON TABLE wow_character_run_shares IS 'Revocable public snapshots; only token hashes and server-built allowlisted payloads are persisted.';

-- +goose Down
DROP TABLE IF EXISTS wow_character_run_shares;
DROP TABLE IF EXISTS wow_character_run_history;
