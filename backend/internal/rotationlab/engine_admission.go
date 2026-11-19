package rotationlab

import (
	"context"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	maxSimCWaiting       = 8
	maxSimCConcurrency   = 2
	defaultSimCQueueWait = 5 * time.Second
)

// Keep the single-process default for workers with a one-CPU budget. Explicitly
// configured workers may run two independent threads=1 simulations, preserving
// each simulation's deterministic stream and precision. Invalid configuration
// retains the safe default instead of disabling the native engine.
func configuredSimCConcurrency() int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv("SIMC_CONCURRENCY")))
	if err != nil || value < 1 || value > maxSimCConcurrency {
		return 1
	}
	return value
}

// NativeSimulationConcurrency advertises the actual shared process capacity,
// rather than an environment value that may not match the running engine.
func (e *SimCEngine) NativeSimulationConcurrency() int { return cap(e.limit) }

// All native entry points share the same bounded process permits. A burst can wait,
// but at most eight requests wait and each wait ends within five seconds (or
// its caller's earlier deadline). No background worker goroutines are needed.
func (e *SimCEngine) acquire(ctx context.Context) error {
	started := time.Now()
	defer recordWorkerQueue(ctx, started)
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case e.limit <- struct{}{}:
		if err := ctx.Err(); err != nil {
			e.release()
			return err
		}
		return nil
	default:
	}
	select {
	case e.waiting <- struct{}{}:
		defer func() { <-e.waiting }()
	default:
		if err := ctx.Err(); err != nil {
			return err
		}
		return ErrSimulationBusy
	}
	waitCtx, cancel := context.WithTimeout(ctx, e.queueWait)
	defer cancel()
	select {
	case e.limit <- struct{}{}:
		// Cancellation may race with a released permit. Return that permit
		// before the caller can launch an already-aborted native request.
		if waitCtx.Err() == nil {
			return nil
		}
		e.release()
	case <-waitCtx.Done():
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return ErrSimulationBusy
}

func (e *SimCEngine) release() { <-e.limit }
