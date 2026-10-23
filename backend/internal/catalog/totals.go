package catalog

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const (
	// totalFreshTTL bounds how stale a page total may be before it is
	// recounted. The catalog only changes on publication, and public
	// responses are already shared-cached for s-maxage=300.
	totalFreshTTL = 10 * time.Minute
	// totalRecountFactor stretches the fresh period of expensive counts so
	// that recounting one costs at most about 1% of the database's time: a
	// two-minute count of every spell is repeated every few hours.
	totalRecountFactor = 100
	// totalStaleTTL is how long a finished count keeps answering while its
	// recount runs in the background.
	totalStaleTTL = 24 * time.Hour
	// totalFailureBackoff keeps a failing count from being retried by every
	// request.
	totalFailureBackoff = time.Minute
	// totalCountTimeout bounds one background count. Exact counts over the
	// production localization table take minutes, far beyond a request.
	totalCountTimeout = 10 * time.Minute
	// totalCountWait is how long a request waits for a total that is not
	// cached yet. Narrow filters finish inside it; whole entity types do not.
	totalCountWait = 2 * time.Second
	// totalCountConcurrency bounds the database connections that background
	// counts hold at once.
	totalCountConcurrency = 2
	// totalCacheEntries bounds memory: totals are keyed by user-supplied
	// filters and queries.
	totalCacheEntries = 2048
)

type totalEntry struct {
	value    int64
	counted  time.Time // zero until a count has finished
	freshFor time.Duration
	failedAt time.Time // when the last count failed, zero after a success
	running  chan struct{}
}

// totalCache remembers exact `count(*)` results for list filters and computes
// them off the request path. An exact count of a whole entity type scans every
// published entity with both its localizations, which takes minutes on the
// production catalog, so a request never waits longer than totalCountWait for
// one: it gets the cached value (recounted in the background once it is
// older than its fresh period) or nothing.
type totalCache struct {
	mu      sync.Mutex
	now     func() time.Time
	entries map[string]*totalEntry
	slots   chan struct{}
	timeout time.Duration
}

func newTotalCache() *totalCache {
	return &totalCache{
		now:     time.Now,
		entries: make(map[string]*totalEntry),
		slots:   make(chan struct{}, totalCountConcurrency),
		timeout: totalCountTimeout,
	}
}

// lookup returns the total for key and whether it is known. A missing or
// stale total starts a background count; lookup waits for it at most wait
// (or until ctx ends). count runs on its own context, detached from ctx.
func (c *totalCache) lookup(ctx context.Context, key string, wait time.Duration, count func(context.Context) (int64, error)) (int64, bool) {
	c.mu.Lock()
	now := c.now()
	entry, ok := c.entries[key]
	if !ok {
		entry = &totalEntry{}
		c.storeLocked(key, entry, now)
	}
	if !entry.counted.IsZero() && now.Sub(entry.counted) < totalStaleTTL {
		value := entry.value
		if now.Sub(entry.counted) >= entry.freshFor {
			c.startLocked(entry, now, count)
		}
		c.mu.Unlock()
		return value, true
	}
	done := c.startLocked(entry, now, count)
	c.mu.Unlock()
	if done == nil || wait <= 0 {
		return 0, false
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
		return 0, false
	case <-ctx.Done():
		return 0, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if entry.counted.IsZero() {
		return 0, false
	}
	return entry.value, true
}

// startLocked starts a count for entry unless one is running, the last one
// failed within totalFailureBackoff or every count slot is busy. It returns
// the channel closed when the running count finishes, or nil.
func (c *totalCache) startLocked(entry *totalEntry, now time.Time, count func(context.Context) (int64, error)) chan struct{} {
	if entry.running != nil {
		return entry.running
	}
	if !entry.failedAt.IsZero() && now.Sub(entry.failedAt) < totalFailureBackoff {
		return nil
	}
	select {
	case c.slots <- struct{}{}:
	default:
		return nil
	}
	done := make(chan struct{})
	entry.running = done
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
		started := c.now()
		value, err := count(ctx)
		cancel()
		<-c.slots
		c.mu.Lock()
		finished := c.now()
		if err != nil {
			entry.failedAt = finished
		} else {
			entry.value, entry.counted, entry.failedAt = value, finished, time.Time{}
			entry.freshFor = max(totalFreshTTL, totalRecountFactor*finished.Sub(started))
		}
		entry.running = nil
		c.mu.Unlock()
		close(done)
		if err != nil {
			slog.Warn("catalog total count failed", "error", err)
		}
	}()
	return done
}

func (c *totalCache) storeLocked(key string, entry *totalEntry, now time.Time) {
	if len(c.entries) >= totalCacheEntries {
		for existing, cached := range c.entries {
			if cached.running == nil && (cached.counted.IsZero() || now.Sub(cached.counted) >= totalStaleTTL) {
				delete(c.entries, existing)
			}
		}
		// Still full of live entries: drop arbitrary idle ones rather than grow.
		for existing, cached := range c.entries {
			if len(c.entries) < totalCacheEntries {
				break
			}
			if cached.running == nil {
				delete(c.entries, existing)
			}
		}
	}
	c.entries[key] = entry
}
