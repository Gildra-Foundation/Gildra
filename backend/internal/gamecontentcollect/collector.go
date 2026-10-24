package gamecontentcollect

import (
	"context"
	"errors"
	"strings"
	"time"
)

type Collector struct {
	store  *Store
	source Source
}

func NewCollector(store *Store, source Source) *Collector { return &Collector{store, source} }

func (c *Collector) Collect(ctx context.Context, t Target, key string, scheduled time.Time) (Run, error) {
	if err := t.Validate(); err != nil {
		return Run{}, &Failure{Code: "unsupported_context"}
	}
	if strings.TrimSpace(key) == "" || len(key) > 200 || scheduled.IsZero() {
		return Run{}, &Failure{Code: "invalid_run_key_or_slot"}
	}
	l, err := c.store.acquire(ctx, t, key, scheduled)
	if err != nil {
		return Run{}, err
	}
	defer l.close()
	if l.run.Status != "running" {
		if l.run.Status == "failed" {
			return l.run, &Failure{Code: *l.run.ErrorCode, Retryable: l.run.Retryable}
		}
		return l.run, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	previous, err := l.cached(ctx)
	if err == nil {
		err = l.cooldown(ctx)
	}
	if err == nil {
		var result FetchResult
		result, err = c.source.Fetch(ctx, t, previous)
		if err == nil {
			err = l.record(ctx, result)
		}
		if err == nil {
			var facts map[string]any
			var warnings []string
			facts, warnings, err = Normalize(t, result.Body)
			if err == nil {
				err = l.finish(ctx, facts, warnings)
			}
		}
	}
	if err != nil {
		var failure *Failure
		if !errors.As(err, &failure) {
			failure = &Failure{Code: "collection_storage_or_cancelled", Retryable: true}
		}
		// Record a cancelled attempt even when the network context has expired.
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if saveErr := l.backoff(cleanup, failure); saveErr != nil {
			return l.run, &Failure{Code: "source_backoff_unavailable", Retryable: true}
		}
		if saveErr := l.fail(cleanup, failure); saveErr != nil {
			return l.run, &Failure{Code: "collection_state_unavailable", Retryable: true}
		}
		return l.run, failure
	}
	return l.run, nil
}
