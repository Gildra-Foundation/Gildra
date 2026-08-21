-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS dataset_refresh_events
(
    run_id UUID,
    snapshot_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
    occurred_at DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date MATERIALIZED toDate(occurred_at),
    dataset LowCardinality(String),
    status Enum8('succeeded' = 1, 'failed' = 2, 'skipped' = 3),
    duration_ms UInt32 DEFAULT 0,
    page_count UInt8 DEFAULT 0,
    record_count UInt16 DEFAULT 0,
    unique_spec_count UInt8 DEFAULT 0,
    credits Decimal(20, 6) DEFAULT 0,
    lkg_preserved Bool DEFAULT false,
    error_code LowCardinality(String) DEFAULT '',
    metadata String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (dataset, status, event_date, occurred_at, run_id)
TTL occurred_at + INTERVAL 25 MONTH DELETE;

-- +goose Down
DROP TABLE IF EXISTS dataset_refresh_events;
