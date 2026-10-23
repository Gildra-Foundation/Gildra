package catalog

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"
)

// testClock is a settable clock shared with background counts.
type testClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *testClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newTestTotalCache() (*totalCache, *testClock) {
	clock := &testClock{now: time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)}
	cache := newTotalCache()
	cache.now = clock.Now
	return cache, clock
}

// settle waits for the background count of key, if any, to finish.
func settle(cache *totalCache, key string) {
	cache.mu.Lock()
	var running chan struct{}
	if entry := cache.entries[key]; entry != nil {
		running = entry.running
	}
	cache.mu.Unlock()
	if running != nil {
		<-running
	}
}

type countCalls struct {
	mu    sync.Mutex
	calls int
}

func (c *countCalls) next() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls++
	return c.calls
}

func (c *countCalls) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls
}

func TestTotalCacheReusesCountsAndRecountsInBackground(t *testing.T) {
	cache, clock := newTestTotalCache()
	var calls countCalls
	count := func(context.Context) (int64, error) { return int64(100 + calls.next()), nil }
	for range 3 {
		if got, ok := cache.lookup(context.Background(), "spell", time.Second, count); !ok || got != 101 {
			t.Fatalf("total = %d, %v; want 101", got, ok)
		}
	}
	if calls.count() != 1 {
		t.Fatalf("counted %d times, want 1", calls.count())
	}
	clock.Add(totalFreshTTL)
	// A stale total still answers at once; the recount replaces it later.
	if got, ok := cache.lookup(context.Background(), "spell", 0, count); !ok || got != 101 {
		t.Fatalf("stale total = %d, %v; want 101 while recounting", got, ok)
	}
	settle(cache, "spell")
	if got, ok := cache.lookup(context.Background(), "spell", 0, count); !ok || got != 102 {
		t.Fatalf("recounted total = %d, %v; want 102", got, ok)
	}
	clock.Add(totalStaleTTL)
	if _, ok := cache.lookup(context.Background(), "spell", 0, count); ok {
		t.Fatal("a total older than totalStaleTTL was served")
	}
}

func TestTotalCacheDoesNotHoldRequestsForSlowCounts(t *testing.T) {
	cache, _ := newTestTotalCache()
	release := make(chan struct{})
	var seen error
	count := func(ctx context.Context) (int64, error) {
		<-release
		seen = ctx.Err()
		return 533234, nil
	}
	request, cancel := context.WithCancel(context.Background())
	if _, ok := cache.lookup(request, "spell", 10*time.Millisecond, count); ok {
		t.Fatal("lookup reported a total for a count that has not finished")
	}
	// The count outlives the request that started it.
	cancel()
	close(release)
	settle(cache, "spell")
	if seen != nil {
		t.Fatalf("background count saw a cancelled context: %v", seen)
	}
	if got, ok := cache.lookup(context.Background(), "spell", 0, count); !ok || got != 533234 {
		t.Fatalf("total = %d, %v; want 533234", got, ok)
	}
}

func TestTotalCacheBacksOffFailedCounts(t *testing.T) {
	cache, clock := newTestTotalCache()
	var calls countCalls
	failure := func(context.Context) (int64, error) {
		calls.next()
		return 0, errors.New("canceling statement due to statement timeout")
	}
	for range 3 {
		if _, ok := cache.lookup(context.Background(), "spell", time.Second, failure); ok {
			t.Fatal("a failed count produced a total")
		}
	}
	if calls.count() != 1 {
		t.Fatalf("failed count ran %d times inside the backoff, want 1", calls.count())
	}
	clock.Add(totalFailureBackoff)
	if got, ok := cache.lookup(context.Background(), "spell", time.Second, func(context.Context) (int64, error) { return 7, nil }); !ok || got != 7 {
		t.Fatalf("total after backoff = %d, %v; want 7", got, ok)
	}
}

func TestTotalCacheKeepsExpensiveCountsFreshLonger(t *testing.T) {
	cache, clock := newTestTotalCache()
	var calls countCalls
	count := func(context.Context) (int64, error) {
		calls.next()
		clock.Add(2 * time.Minute)
		return 533234, nil
	}
	if _, ok := cache.lookup(context.Background(), "spell", time.Second, count); !ok {
		t.Fatal("count did not finish")
	}
	clock.Add(3 * time.Hour)
	cache.lookup(context.Background(), "spell", 0, count)
	settle(cache, "spell")
	if calls.count() != 1 {
		t.Fatalf("a two-minute count was repeated after 3h (%d runs); want it fresh for %s", calls.count(), totalRecountFactor*2*time.Minute)
	}
}

func TestTotalCacheBoundsConcurrentCounts(t *testing.T) {
	for _, slow := range []bool{false, true} {
		cache, _ := newTestTotalCache()
		release := make(chan struct{})
		blocked := func(context.Context) (int64, error) {
			<-release
			return 1, nil
		}
		limit := totalQuickConcurrency
		if slow {
			limit = totalCountConcurrency
		}
		for index := range limit {
			key := "busy" + strconv.Itoa(index)
			cache.entries[key] = &totalEntry{slow: slow}
			cache.lookup(context.Background(), key, 0, blocked)
		}
		ran := false
		cache.entries["spell"] = &totalEntry{slow: slow}
		if _, ok := cache.lookup(context.Background(), "spell", 10*time.Millisecond, func(context.Context) (int64, error) {
			ran = true
			return 1, nil
		}); ok || ran {
			t.Fatalf("slow=%v: count started with every slot busy (ok=%v ran=%v)", slow, ok, ran)
		}
		close(release)
		for index := range limit {
			settle(cache, "busy"+strconv.Itoa(index))
		}
		if _, ok := cache.lookup(context.Background(), "spell", time.Second, func(context.Context) (int64, error) { return 1, nil }); !ok {
			t.Fatalf("slow=%v: count did not start once a slot was free", slow)
		}
	}
}

func TestTotalCacheKeepsCheapCountsAheadOfSlowOnes(t *testing.T) {
	cache, _ := newTestTotalCache()
	release := make(chan struct{})
	defer close(release)
	for index := range totalCountConcurrency {
		key := "spell" + strconv.Itoa(index)
		cache.entries[key] = &totalEntry{slow: true}
		cache.lookup(context.Background(), key, 0, func(context.Context) (int64, error) {
			<-release
			return 533234, nil
		})
	}
	// Every slow slot is held by a minutes-long count; a projection read
	// still answers inside the request.
	if got, ok := cache.lookup(context.Background(), "summary", time.Second, func(context.Context) (int64, error) { return 413935, nil }); !ok || got != 413935 {
		t.Fatalf("cheap total = %d, %v; want 413935 while slow counts run", got, ok)
	}
}

func TestTotalCacheMovesTimedOutCountsToSlowSlots(t *testing.T) {
	cache, clock := newTestTotalCache()
	cache.quickTimeout = 10 * time.Millisecond
	var calls countCalls
	count := func(ctx context.Context) (int64, error) {
		if calls.next() == 1 {
			<-ctx.Done()
			return 0, ctx.Err()
		}
		clock.Add(2 * time.Minute)
		return 533234, nil
	}
	if _, ok := cache.lookup(context.Background(), "spell", 0, count); ok {
		t.Fatal("lookup reported a total before any count finished")
	}
	settle(cache, "spell") // the quick count times out and starts a slow one
	settle(cache, "spell")
	if got, ok := cache.lookup(context.Background(), "spell", 0, count); !ok || got != 533234 {
		t.Fatalf("total = %d, %v; want 533234 from the slow recount", got, ok)
	}
	cache.mu.Lock()
	entry := cache.entries["spell"]
	cache.mu.Unlock()
	if !entry.slow || !entry.failedAt.IsZero() || calls.count() != 2 {
		t.Fatalf("slow=%v failedAt=%v calls=%d; want a slow entry counted twice without a failure", entry.slow, entry.failedAt, calls.count())
	}
}

func TestTotalCacheStaysBounded(t *testing.T) {
	cache, _ := newTestTotalCache()
	for index := range totalCacheEntries + 50 {
		if _, ok := cache.lookup(context.Background(), strconv.Itoa(index), time.Second, func(context.Context) (int64, error) { return 1, nil }); !ok {
			t.Fatalf("count %d did not finish", index)
		}
	}
	if len(cache.entries) > totalCacheEntries {
		t.Fatalf("cache grew to %d entries, limit %d", len(cache.entries), totalCacheEntries)
	}
}

func TestPlanRowsReadsTheTopNode(t *testing.T) {
	// A parallel plan: the Gather carries the whole estimate, the scan below it
	// a per-worker share.
	raw := []byte(`[{"Plan": {"Node Type": "Gather", "Plan Rows": 533234.4,
		"Plans": [{"Node Type": "Parallel Seq Scan", "Parent Relationship": "Outer", "Plan Rows": 222181}]}}]`)
	if got, err := planRows(raw); err != nil || got != 533234 {
		t.Fatalf("planRows = %d, %v; want 533234", got, err)
	}
	if _, err := planRows([]byte(`[]`)); err == nil {
		t.Fatal("an empty plan was accepted")
	}
}

// memoryTotalStore stands in for Redis; saved signals each save.
type memoryTotalStore struct {
	mu     sync.Mutex
	totals map[string]savedTotal
	saved  chan string
}

func (s *memoryTotalStore) load(_ context.Context, key string) (savedTotal, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	total, ok := s.totals[key]
	return total, ok
}

func (s *memoryTotalStore) save(_ context.Context, key string, total savedTotal) {
	s.mu.Lock()
	s.totals[key] = total
	s.mu.Unlock()
	s.saved <- key
}

func TestTotalCacheResumesSavedCountsAfterRestart(t *testing.T) {
	store := &memoryTotalStore{totals: map[string]savedTotal{}, saved: make(chan string, 4)}
	first, clock := newTestTotalCache()
	first.store = store
	var calls countCalls
	count := func(context.Context) (int64, error) { return int64(500 + calls.next()), nil }
	if got, ok := first.lookup(context.Background(), "spell", time.Second, count); !ok || got != 501 {
		t.Fatalf("total = %d, %v; want 501", got, ok)
	}
	<-store.saved

	// A new process answers from the store without counting again.
	restarted := newTotalCache()
	restarted.now = clock.Now
	restarted.store = store
	clock.Add(totalFreshTTL / 2)
	if got, ok := restarted.lookup(context.Background(), "spell", 0, count); !ok || got != 501 {
		t.Fatalf("restarted total = %d, %v; want the saved 501", got, ok)
	}
	if calls.count() != 1 {
		t.Fatalf("counted %d times, want 1: a fresh saved total was recounted", calls.count())
	}
	// Its recount schedule carries over: once due, it recounts in the background.
	clock.Add(totalFreshTTL)
	if got, ok := restarted.lookup(context.Background(), "spell", 0, count); !ok || got != 501 {
		t.Fatalf("stale saved total = %d, %v; want 501 while recounting", got, ok)
	}
	<-store.saved
	if got, _ := restarted.lookup(context.Background(), "spell", 0, count); got != 502 {
		t.Fatalf("recounted total = %d; want 502", got)
	}
}
