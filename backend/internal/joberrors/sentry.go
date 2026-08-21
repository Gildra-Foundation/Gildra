package joberrors

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/getsentry/sentry-go"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

type SentryHandler struct{}

func (*SentryHandler) HandleError(ctx context.Context, job *rivertype.JobRow, err error) *river.ErrorHandlerResult {
	slog.ErrorContext(ctx, "river_job_failed",
		"event", "river_job_failed", "job_kind", job.Kind, "queue", job.Queue,
		"job_id", job.ID, "attempt", job.Attempt, "max_attempts", job.MaxAttempts,
		"error", err)
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetTag("river.kind", job.Kind)
		scope.SetTag("river.queue", job.Queue)
		scope.SetTag("river.job_id", strconv.FormatInt(job.ID, 10))
		scope.SetContext("river", sentry.Context{
			"attempt":      job.Attempt,
			"max_attempts": job.MaxAttempts,
		})
		sentry.CaptureException(err)
	})
	return nil
}

func (*SentryHandler) HandlePanic(ctx context.Context, job *rivertype.JobRow, panicValue any, trace string) *river.ErrorHandlerResult {
	slog.ErrorContext(ctx, "river_job_panicked",
		"event", "river_job_panicked", "job_kind", job.Kind, "queue", job.Queue,
		"job_id", job.ID, "attempt", job.Attempt, "max_attempts", job.MaxAttempts)
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetTag("river.kind", job.Kind)
		scope.SetTag("river.queue", job.Queue)
		scope.SetTag("river.job_id", strconv.FormatInt(job.ID, 10))
		scope.SetContext("river", sentry.Context{"trace": trace})
		sentry.CaptureMessage(fmt.Sprintf("River job panic: %v", panicValue))
	})
	return nil
}
