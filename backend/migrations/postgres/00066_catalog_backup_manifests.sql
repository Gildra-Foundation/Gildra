-- +goose Up
-- Operational history is useful inside PostgreSQL, while the signed JSON
-- manifest must also be stored next to the backup so it survives a DB loss.
CREATE TABLE catalog_backup_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component TEXT NOT NULL CHECK (component IN ('postgres','clickhouse','media')),
    backup_kind TEXT NOT NULL CHECK (backup_kind IN ('full','incremental','logical')),
    status TEXT NOT NULL DEFAULT 'creating'
        CHECK (status IN ('creating','created','verifying','verified','failed','expired')),
    storage_uri TEXT NOT NULL CHECK (storage_uri ~ '^(s3|r2|swift|file)://'),
    content_hash BYTEA CHECK (content_hash IS NULL OR octet_length(content_hash) = 32),
    byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
    product_id SMALLINT REFERENCES game_products(id) ON DELETE SET NULL,
    build_id BIGINT REFERENCES game_builds(id) ON DELETE SET NULL,
    snapshot_id UUID REFERENCES catalog_snapshots(id) ON DELETE SET NULL,
    database_version BIGINT CHECK (database_version IS NULL OR database_version >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    restore_started_at TIMESTAMPTZ,
    restore_completed_at TIMESTAMPTZ,
    restore_duration_ms BIGINT CHECK (restore_duration_ms IS NULL OR restore_duration_ms >= 0),
    verification JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(verification) = 'object'),
    error_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (completed_at IS NULL OR completed_at >= started_at),
    CHECK (restore_completed_at IS NULL OR restore_started_at IS NULL OR restore_completed_at >= restore_started_at),
    CHECK (status NOT IN ('created','verified') OR (content_hash IS NOT NULL AND byte_size IS NOT NULL))
);

CREATE INDEX catalog_backup_manifests_recent_idx
    ON catalog_backup_manifests (component, started_at DESC, id);
CREATE INDEX catalog_backup_manifests_unverified_idx
    ON catalog_backup_manifests (started_at, component)
    WHERE status IN ('created','failed');

-- +goose Down
DROP TABLE IF EXISTS catalog_backup_manifests;
