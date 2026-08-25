-- +goose Up
-- The same immutable upstream file may legitimately participate in several
-- retry releases. Snapshot identity, not file content, owns the artifact row.
DROP INDEX IF EXISTS catalog_source_artifacts_hash_idx;
CREATE INDEX catalog_source_artifacts_hash_idx
    ON catalog_source_artifacts(source, build_id, artifact_key, locale, content_hash)
    WHERE content_hash IS NOT NULL;
CREATE INDEX catalog_source_artifacts_verification_idx
    ON catalog_source_artifacts(status, source, fetched_at DESC)
    WHERE status IN ('fetching', 'failed') OR content_hash IS NULL OR byte_size IS NULL;

-- +goose Down
DROP INDEX IF EXISTS catalog_source_artifacts_verification_idx;
-- Keep the hash lookup non-unique: retries created while this migration was
-- active can share the same immutable file and must remain rollback-safe.
DROP INDEX IF EXISTS catalog_source_artifacts_hash_idx;
CREATE INDEX catalog_source_artifacts_hash_idx
    ON catalog_source_artifacts(source, build_id, artifact_key, locale, content_hash)
    WHERE content_hash IS NOT NULL;
