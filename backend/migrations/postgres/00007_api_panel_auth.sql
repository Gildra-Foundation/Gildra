-- +goose Up
ALTER TABLE users
    ADD COLUMN password_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),
    ADD COLUMN last_login_at TIMESTAMPTZ;

CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent TEXT NOT NULL DEFAULT '',
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id, expires_at DESC);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at)
    WHERE revoked_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS auth_sessions;
ALTER TABLE users
    DROP COLUMN IF EXISTS last_login_at,
    DROP COLUMN IF EXISTS role,
    DROP COLUMN IF EXISTS password_hash;
