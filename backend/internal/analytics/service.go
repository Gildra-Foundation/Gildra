package analytics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
)

const overviewCachePrefix = "analytics:overview:"

type Service struct {
	clickhouse driver.Conn
	postgres   *pgxpool.Pool
	redis      *redis.Client
	cacheTTL   time.Duration
}

func NewService(clickhouse driver.Conn, postgres *pgxpool.Pool, redisClient *redis.Client, cacheTTL time.Duration) *Service {
	return &Service{clickhouse: clickhouse, postgres: postgres, redis: redisClient, cacheTTL: cacheTTL}
}

func (s *Service) Ingest(ctx context.Context, events []api.AnalyticsEvent) error {
	if len(events) == 0 {
		return errors.New("at least one event is required")
	}

	query := `INSERT INTO analytics_events
		(event_id, occurred_at, event_name, locale, path, user_id, session_id, value, properties)`
	batch, err := s.clickhouse.PrepareBatch(ctx, query)
	if err != nil {
		return fmt.Errorf("prepare analytics batch: %w", err)
	}

	now := time.Now().UTC()
	for _, event := range events {
		if event.EventName == "" || !event.Locale.Valid() {
			return errors.New("each event needs a valid eventName and locale")
		}

		eventID := uuid.New()
		if event.EventId != nil {
			eventID = *event.EventId
		}
		occurredAt := now
		if event.OccurredAt != nil {
			occurredAt = event.OccurredAt.UTC()
		}
		visitorID := event.SessionId
		if event.UserId != nil {
			visitorID = *event.UserId
		}
		value := 0.0
		if event.Value != nil {
			value = *event.Value
		}
		properties := []byte("{}")
		if event.Properties != nil {
			properties, err = json.Marshal(*event.Properties)
			if err != nil {
				return fmt.Errorf("encode analytics properties: %w", err)
			}
		}

		if err := batch.Append(
			eventID, occurredAt, event.EventName, string(event.Locale), event.Path,
			visitorID, event.SessionId, value, string(properties),
		); err != nil {
			return fmt.Errorf("append analytics event: %w", err)
		}
	}

	if err := batch.Send(); err != nil {
		return fmt.Errorf("send analytics batch: %w", err)
	}
	_ = s.redis.Del(ctx, overviewCachePrefix+"24", overviewCachePrefix+"168").Err()
	return nil
}

func (s *Service) Overview(ctx context.Context, hours int) (api.AnalyticsOverview, error) {
	cacheKey := fmt.Sprintf("%s%d", overviewCachePrefix, hours)
	if encoded, err := s.redis.Get(ctx, cacheKey).Bytes(); err == nil {
		var cached api.AnalyticsOverview
		if json.Unmarshal(encoded, &cached) == nil {
			if cached.Series == nil {
				cached.Series = make([]api.AnalyticsPoint, 0)
			}
			return cached, nil
		}
	}

	from := time.Now().UTC().Add(-time.Duration(hours) * time.Hour)
	rows, err := s.clickhouse.Query(ctx, `
		SELECT hour, countMerge(events), uniqCombined64Merge(unique_users)
		FROM analytics_events_hourly
		WHERE hour >= ?
		GROUP BY hour
		ORDER BY hour`, from)
	if err != nil {
		return api.AnalyticsOverview{}, fmt.Errorf("query analytics overview: %w", err)
	}
	defer rows.Close()

	series := make([]api.AnalyticsPoint, 0, hours)
	for rows.Next() {
		var point api.AnalyticsPoint
		if err := rows.Scan(&point.Hour, &point.Events, &point.UniqueUsers); err != nil {
			return api.AnalyticsOverview{}, fmt.Errorf("scan analytics overview: %w", err)
		}
		series = append(series, point)
	}
	if err := rows.Err(); err != nil {
		return api.AnalyticsOverview{}, fmt.Errorf("iterate analytics overview: %w", err)
	}
	var totalEvents, totalUsers int64
	if err := s.clickhouse.QueryRow(ctx, `
		SELECT countMerge(events), uniqCombined64Merge(unique_users)
		FROM analytics_events_hourly
		WHERE hour >= ?`, from).Scan(&totalEvents, &totalUsers); err != nil {
		return api.AnalyticsOverview{}, fmt.Errorf("query analytics totals: %w", err)
	}

	var activeSubscriptions int64
	if err := s.postgres.QueryRow(ctx, `SELECT count(*) FROM subscriptions WHERE status IN ('active', 'trialing')`).Scan(&activeSubscriptions); err != nil {
		return api.AnalyticsOverview{}, fmt.Errorf("count active subscriptions: %w", err)
	}

	overview := api.AnalyticsOverview{
		Hours: hours, Events: totalEvents, UniqueUsers: totalUsers,
		ActiveSubscriptions: activeSubscriptions, Series: series,
	}
	if encoded, err := json.Marshal(overview); err == nil {
		_ = s.redis.Set(ctx, cacheKey, encoded, s.cacheTTL).Err()
	}
	return overview, nil
}

func (s *Service) Ready(ctx context.Context) error {
	if err := s.postgres.Ping(ctx); err != nil {
		return fmt.Errorf("postgres: %w", err)
	}
	if err := s.clickhouse.Ping(ctx); err != nil {
		return fmt.Errorf("clickhouse: %w", err)
	}
	if err := s.redis.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}
	return nil
}
