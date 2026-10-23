package catalog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

// totalRedisPrefix namespaces the saved totals; bump the version when
// savedTotal or the meaning of a total key changes.
const totalRedisPrefix = "catalog:total:v1:"

// redisTotalStore saves finished catalog counts in Redis for totalStaleTTL,
// after which a total is no longer served anyway. Keys are hashed because
// total keys carry user-supplied search text.
type redisTotalStore struct {
	client *redis.Client
}

func (s redisTotalStore) redisKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return totalRedisPrefix + hex.EncodeToString(sum[:])
}

func (s redisTotalStore) load(ctx context.Context, key string) (savedTotal, bool) {
	raw, err := s.client.Get(ctx, s.redisKey(key)).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			slog.Debug("catalog total not loaded", "error", err)
		}
		return savedTotal{}, false
	}
	var saved savedTotal
	if err := json.Unmarshal(raw, &saved); err != nil || saved.Counted.IsZero() {
		return savedTotal{}, false
	}
	return saved, true
}

func (s redisTotalStore) save(ctx context.Context, key string, total savedTotal) {
	raw, err := json.Marshal(total)
	if err == nil {
		err = s.client.Set(ctx, s.redisKey(key), raw, totalStaleTTL).Err()
	}
	if err != nil {
		slog.Debug("catalog total not saved", "error", err)
	}
}

// PersistTotals keeps the service's finished counts in Redis, so they survive
// an API restart (see totalStore). Call it before the service is used.
func (s *Service) PersistTotals(client *redis.Client) {
	s.totals.store = redisTotalStore{client: client}
}
