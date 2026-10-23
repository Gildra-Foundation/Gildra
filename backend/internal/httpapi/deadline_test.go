package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLimitRequestDurationSetsDeadlineOutsideExemptPaths(t *testing.T) {
	var deadline time.Time
	var hasDeadline bool
	handler := LimitRequestDuration(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		deadline, hasDeadline = r.Context().Deadline()
	}), 20*time.Second, LongRunningPrefixes)

	start := time.Now()
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/game/entities", nil))
	if !hasDeadline || deadline.Before(start.Add(19*time.Second)) || deadline.After(start.Add(21*time.Second)) {
		t.Fatalf("catalog request deadline = %v (set %v), want about 20s", deadline.Sub(start), hasDeadline)
	}
	for _, path := range []string{"/v1/admin/catalog-readiness", "/v1/wow/rotation/simulations", "/v1/media/icons/x.jpg"} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
		if hasDeadline {
			t.Fatalf("%s got a deadline; it bounds its own work", path)
		}
	}
}

func TestLimitRequestDurationDisabled(t *testing.T) {
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	if got := LimitRequestDuration(next, 0, nil); got == nil {
		t.Fatal("nil handler")
	}
}
