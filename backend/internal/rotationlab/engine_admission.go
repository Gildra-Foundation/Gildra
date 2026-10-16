package rotationlab

import (
	"context"
	"time"
)

const (
	maxSimCWaiting       = 8
	defaultSimCQueueWait = 5 * time.Second
)

// Both native entry points share one process permit. A short burst can wait,
// but at most eight requests wait and each wait ends within five seconds (or
// its caller's earlier deadline). No background worker goroutines are needed.
func (e *SimCEngine) acquire(ctx context.Context) error {
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
