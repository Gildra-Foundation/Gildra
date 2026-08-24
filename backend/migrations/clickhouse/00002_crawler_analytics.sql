-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS crawler_attempts
(
    attempt_id UUID DEFAULT generateUUIDv4(),
    run_id UUID,
    occurred_at DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date MATERIALIZED toDate(occurred_at),
    source LowCardinality(String),
    provider LowCardinality(String),
    strategy LowCardinality(String),
    verdict LowCardinality(String),
    url_hash UInt64,
    target_status UInt16 DEFAULT 0,
    duration_ms UInt32 DEFAULT 0,
    response_bytes UInt64 DEFAULT 0,
    credits Decimal(20, 6) DEFAULT 0,
    cost_usd Decimal(20, 6) DEFAULT 0,
    from_cache Bool DEFAULT false,
    error_code LowCardinality(String) DEFAULT '',
    metadata String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (source, provider, event_date, verdict, occurred_at, url_hash)
TTL occurred_at + INTERVAL 25 MONTH DELETE;

CREATE TABLE IF NOT EXISTS crawler_attempts_hourly
(
    source LowCardinality(String),
    provider LowCardinality(String),
    strategy LowCardinality(String),
    verdict LowCardinality(String),
    hour DateTime('UTC'),
    attempts UInt64,
    successful UInt64,
    credits Decimal(20, 6),
    cost_usd Decimal(20, 6),
    duration_ms UInt64,
    response_bytes UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (source, provider, strategy, verdict, hour)
TTL hour + INTERVAL 25 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS crawler_attempts_hourly_mv
TO crawler_attempts_hourly
AS
SELECT
    source,
    provider,
    strategy,
    verdict,
    toStartOfHour(occurred_at) AS hour,
    count() AS attempts,
    countIf(verdict = 'OK') AS successful,
    sum(credits) AS credits,
    sum(cost_usd) AS cost_usd,
    sum(toUInt64(duration_ms)) AS duration_ms,
    sum(response_bytes) AS response_bytes
FROM crawler_attempts
GROUP BY source, provider, strategy, verdict, hour;

-- +goose Down
DROP VIEW IF EXISTS crawler_attempts_hourly_mv;
DROP TABLE IF EXISTS crawler_attempts_hourly;
DROP TABLE IF EXISTS crawler_attempts;
