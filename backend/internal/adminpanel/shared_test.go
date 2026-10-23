package adminpanel

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sync/singleflight"
)

func TestSharedRunsOneLoadForConcurrentCallers(t *testing.T) {
	var group singleflight.Group
	var loads atomic.Int32
	release := make(chan struct{})
	load := func() (int, error) {
		loads.Add(1)
		<-release
		return 7, nil
	}
	var wait sync.WaitGroup
	results := make(chan int, 5)
	for range 5 {
		wait.Go(func() {
			value, err := shared(context.Background(), &group, "readiness", load)
			if err != nil {
				t.Error(err)
			}
			results <- value
		})
	}
	time.Sleep(50 * time.Millisecond)
	close(release)
	wait.Wait()
	close(results)
	for value := range results {
		if value != 7 {
			t.Fatalf("value = %d, want 7", value)
		}
	}
	if got := loads.Load(); got != 1 {
		t.Fatalf("load ran %d times for concurrent callers, want 1", got)
	}
}

func TestSharedStopsWaitingAtCallerDeadline(t *testing.T) {
	var group singleflight.Group
	release := make(chan struct{})
	defer close(release)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := shared(ctx, &group, "health", func() (int, error) { <-release; return 1, nil })
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want the caller's deadline", err)
	}
}
