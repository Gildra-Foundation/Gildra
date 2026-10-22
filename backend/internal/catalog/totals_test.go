package catalog

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"
)

func TestTotalCacheReusesCountsUntilExpiry(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	cache := newTotalCache()
	cache.now = func() time.Time { return now }
	calls := 0
	count := func(context.Context) (int64, error) {
		calls++
		return int64(100 + calls), nil
	}
	for range 3 {
		if got, err := cache.get(context.Background(), "spell", count); err != nil || got != 101 {
			t.Fatalf("total = %d, %v; want 101", got, err)
		}
	}
	if calls != 1 {
		t.Fatalf("counted %d times, want 1", calls)
	}
	now = now.Add(totalCacheTTL)
	if got, _ := cache.get(context.Background(), "spell", count); got != 102 {
		t.Fatalf("expired total = %d, want a fresh count 102", got)
	}
}

func TestTotalCacheDoesNotCacheErrorsAndStaysBounded(t *testing.T) {
	cache := newTotalCache()
	failure := errors.New("database unavailable")
	if _, err := cache.get(context.Background(), "spell", func(context.Context) (int64, error) { return 0, failure }); !errors.Is(err, failure) {
		t.Fatalf("error = %v, want %v", err, failure)
	}
	if len(cache.entries) != 0 {
		t.Fatalf("a failed count was cached: %v", cache.entries)
	}
	for index := range totalCacheEntries + 50 {
		if _, err := cache.get(context.Background(), strconv.Itoa(index), func(context.Context) (int64, error) { return 1, nil }); err != nil {
			t.Fatal(err)
		}
	}
	if len(cache.entries) > totalCacheEntries {
		t.Fatalf("cache grew to %d entries, limit %d", len(cache.entries), totalCacheEntries)
	}
}
