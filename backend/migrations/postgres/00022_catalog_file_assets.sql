-- +goose Up
CREATE TABLE catalog_file_assets (
    file_data_id BIGINT PRIMARY KEY CHECK (file_data_id > 0),
    path TEXT NOT NULL,
    icon_name TEXT,
    source_url TEXT NOT NULL CHECK (source_url ~ '^https://github[.]com/wowdev/wow-listfile/'),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX catalog_file_assets_icon_name_idx
    ON catalog_file_assets (icon_name, file_data_id)
    WHERE icon_name IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS catalog_file_assets;
