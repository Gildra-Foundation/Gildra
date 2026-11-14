package rotationlab

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type workerTimingKey struct{}
type workerTiming struct {
	queue, native                 time.Duration
	queueRecorded, nativeRecorded bool
}

func recordWorkerQueue(ctx context.Context, started time.Time) {
	if timing, ok := ctx.Value(workerTimingKey{}).(*workerTiming); ok {
		timing.queue += time.Since(started)
		timing.queueRecorded = true
	}
}
func runTimedNative(ctx context.Context, run func() error) error {
	started := time.Now()
	defer func() {
		if timing, ok := ctx.Value(workerTimingKey{}).(*workerTiming); ok {
			timing.native += time.Since(started)
			timing.nativeRecorded = true
		}
	}()
	return run()
}

type timingWriter struct {
	http.ResponseWriter
	timing  *workerTiming
	written bool
}

func (w *timingWriter) WriteHeader(status int) {
	if w.written {
		return
	}
	// Informational responses do not commit the final response headers.
	if status >= 100 && status < 200 {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	metrics := []string{}
	if w.timing.queueRecorded {
		metrics = append(metrics, fmt.Sprintf("queue;dur=%.3f", float64(w.timing.queue)/float64(time.Millisecond)))
	}
	if w.timing.nativeRecorded {
		metrics = append(metrics, fmt.Sprintf("native;dur=%.3f", float64(w.timing.native)/float64(time.Millisecond)))
	}
	if len(metrics) > 0 {
		w.Header().Set("Server-Timing", strings.Join(metrics, ", "))
	}
	w.written = true
	w.ResponseWriter.WriteHeader(status)
}
func (w *timingWriter) Write(body []byte) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}
func withWorkerTiming(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		timing := &workerTiming{}
		handler(&timingWriter{ResponseWriter: w, timing: timing}, r.WithContext(context.WithValue(r.Context(), workerTimingKey{}, timing)))
	}
}
