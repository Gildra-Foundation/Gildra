-- +goose Up
CREATE TABLE catalog_source_records (
    artifact_id UUID NOT NULL REFERENCES catalog_source_artifacts(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL CHECK (btrim(record_key) <> ''),
    payload JSONB NOT NULL,
    content_hash BYTEA NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (artifact_id, record_key)
);
CREATE INDEX catalog_source_records_hash_idx
    ON catalog_source_records (content_hash);

-- +goose Down
DROP TABLE IF EXISTS catalog_source_records;
