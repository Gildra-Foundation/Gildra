package joberrors

import (
	"context"
	"fmt"
	"strconv"

	"github.com/getsentry/sentry-go"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

type SentryHandler struct{}

func (*SentryHandler) HandleError(_ context.Context, job *rivertype.JobRow, err error) *river.ErrorHandlerResult {
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

func (*SentryHandler) HandlePanic(_ context.Context, job *rivertype.JobRow, panicValue any, trace string) *river.ErrorHandlerResult {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetTag("river.kind", job.Kind)
		scope.SetTag("river.queue", job.Queue)
		scope.SetTag("river.job_id", strconv.FormatInt(job.ID, 10))
		scope.SetContext("river", sentry.Context{"trace": trace})
		sentry.CaptureMessage(fmt.Sprintf("River job panic: %v", panicValue))
	})
	return nil
}
