-- +goose NO TRANSACTION
-- +goose Up
ALTER TABLE dataset_refresh_events
    MODIFY COLUMN page_count UInt32 DEFAULT 0,
    MODIFY COLUMN record_count UInt32 DEFAULT 0,
    MODIFY COLUMN unique_spec_count UInt16 DEFAULT 0;

-- +goose Down
ALTER TABLE dataset_refresh_events
    MODIFY COLUMN page_count UInt8 DEFAULT 0,
    MODIFY COLUMN record_count UInt16 DEFAULT 0,
    MODIFY COLUMN unique_spec_count UInt8 DEFAULT 0;
