package rotationlab

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWorkerTimingReportsQueueAndNativeOnFailure(t *testing.T) {
	handler := withWorkerTiming(func(w http.ResponseWriter, r *http.Request) {
		timing := r.Context().Value(workerTimingKey{}).(*workerTiming)
		timing.queue = 2 * time.Millisecond
		timing.queueRecorded = true
		err := runTimedNative(r.Context(), func() error { time.Sleep(time.Millisecond); return errors.New("native_failed") })
		if err == nil || timing.native <= 0 {
			t.Fatal("failed native execution lost its timing")
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	response := httptest.NewRecorder()
	handler(response, httptest.NewRequest("POST", "/", nil))
	if response.Code != 503 || !strings.HasPrefix(response.Header().Get("Server-Timing"), "queue;dur=2.000, native;dur=") {
		t.Fatalf("missing failure timing: %v", response)
	}
}
