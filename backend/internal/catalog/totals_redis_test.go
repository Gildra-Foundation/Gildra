package catalog

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// Runs against a throwaway Redis: GILDRA_TEST_REDIS_ADDR=127.0.0.1:6379.
func TestRedisTotalStoreRoundTrip(t *testing.T) {
	addr := os.Getenv("GILDRA_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("GILDRA_TEST_REDIS_ADDR not set")
	}
	client := redis.NewClient(&redis.Options{Addr: addr})
	defer client.Close()
	store := redisTotalStore{client: client}
	ctx := context.Background()
	key := "list\x00wow\x00spell\x00\x00en_US\x00frost"
	if _, ok := store.load(ctx, key); ok {
		t.Fatal("loaded a total that was never saved")
	}
	want := savedTotal{Value: 533234, Counted: time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC), FreshFor: 3 * time.Hour, Slow: true}
	store.save(ctx, key, want)
	got, ok := store.load(ctx, key)
	if !ok || got.Value != want.Value || !got.Counted.Equal(want.Counted) || got.FreshFor != want.FreshFor || got.Slow != want.Slow {
		t.Fatalf("loaded %+v, %v; want %+v", got, ok, want)
	}
	if ttl := client.TTL(ctx, store.redisKey(key)).Val(); ttl <= 0 || ttl > totalStaleTTL {
		t.Fatalf("ttl = %v, want (0, %v]", ttl, totalStaleTTL)
	}
}
