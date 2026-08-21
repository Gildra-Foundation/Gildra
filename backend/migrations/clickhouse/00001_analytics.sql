-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS analytics_events
(
    event_id UUID DEFAULT generateUUIDv4(),
    occurred_at DateTime64(3, 'UTC') DEFAULT now64(3),
    event_date Date MATERIALIZED toDate(occurred_at),
    event_name LowCardinality(String),
    locale Enum8('en' = 1, 'ru' = 2),
    path String DEFAULT '',
    user_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
    session_id UUID,
    value Float64 DEFAULT 0,
    properties String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_name, event_date, path, occurred_at, event_id)
TTL occurred_at + INTERVAL 13 MONTH DELETE;

CREATE TABLE IF NOT EXISTS analytics_events_hourly
(
    event_name LowCardinality(String),
    locale Enum8('en' = 1, 'ru' = 2),
    hour DateTime('UTC'),
    events AggregateFunction(count),
    unique_users AggregateFunction(uniqCombined64, UUID)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (event_name, locale, hour)
TTL hour + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_events_hourly_mv
TO analytics_events_hourly
AS
SELECT
    event_name,
    locale,
    toStartOfHour(occurred_at) AS hour,
    countState() AS events,
    uniqCombined64State(user_id) AS unique_users
FROM analytics_events
GROUP BY event_name, locale, hour;

-- +goose Down
DROP VIEW IF EXISTS analytics_events_hourly_mv;
DROP TABLE IF EXISTS analytics_events_hourly;
DROP TABLE IF EXISTS analytics_events;
