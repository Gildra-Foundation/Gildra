package catalog

import (
	"context"
	"sync"
	"time"
)

const (
	// totalCacheTTL bounds how stale a page total may be. The catalog only
	// changes on publication, and public responses are already shared-cached
	// for longer (s-maxage=300).
	totalCacheTTL = time.Minute
	// totalCacheEntries bounds memory: totals are keyed by user-supplied
	// filters and queries.
	totalCacheEntries = 2048
)

type totalEntry struct {
	value   int64
	expires time.Time
}

// totalCache remembers exact `count(*)` results for list filters. Counting a
// whole entity type scans every published entity of it (about 3 s for 150k
// spells), and before this every page of the same listing paid that again.
type totalCache struct {
	mu      sync.Mutex
	now     func() time.Time
	entries map[string]totalEntry
}

func newTotalCache() *totalCache {
	return &totalCache{now: time.Now, entries: make(map[string]totalEntry)}
}

// get returns the cached total for key or computes and stores it. Failed
// counts are not cached.
func (c *totalCache) get(ctx context.Context, key string, count func(context.Context) (int64, error)) (int64, error) {
	now := c.now()
	c.mu.Lock()
	entry, ok := c.entries[key]
	c.mu.Unlock()
	if ok && now.Before(entry.expires) {
		return entry.value, nil
	}
	value, err := count(ctx)
	if err != nil {
		return 0, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= totalCacheEntries {
		for existing, cached := range c.entries {
			if !now.Before(cached.expires) {
				delete(c.entries, existing)
			}
		}
		// Still full of live entries: drop arbitrary ones rather than grow.
		for existing := range c.entries {
			if len(c.entries) < totalCacheEntries {
				break
			}
			delete(c.entries, existing)
		}
	}
	c.entries[key] = totalEntry{value: value, expires: now.Add(totalCacheTTL)}
	return value, nil
}
