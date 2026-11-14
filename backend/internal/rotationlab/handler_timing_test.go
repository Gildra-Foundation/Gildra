package rotationlab

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The production DB-backed route uses API, unlike the standalone worker route.
// Exercise its actual registration so missing middleware cannot pass unnoticed.
type timedAPI struct {
	fakeAPI
	fail bool
}

func (api timedAPI) Simulate(ctx context.Context, input SimulationInput) (SimulationResult, error) {
	recordWorkerQueue(ctx, time.Now().Add(-2*time.Millisecond))
	err := runTimedNative(ctx, func() error {
		time.Sleep(time.Millisecond)
		if api.fail {
			return errors.New("synthetic native failure")
		}
		return nil
	})
	return SimulationResult{Engine: "SimulationCraft test"}, err
}

func TestServiceSimulationRouteReportsNativeTiming(t *testing.T) {
	for _, failed := range []bool{false, true} {
		mux := http.NewServeMux()
		NewHandler(timedAPI{fail: failed}).Register(mux)
		response := httptest.NewRecorder()
		body := `{"spec":"fury-warrior","scenario":"single-target","fightLengthSeconds":120,"targets":1,"rules":["rampage"]}`
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(body)))
		want := http.StatusCreated
		if failed {
			want = http.StatusInternalServerError
		}
		if response.Code != want {
			t.Fatalf("status %d: %s", response.Code, response.Body.String())
		}
		header := response.Header().Values("Server-Timing")
		if len(header) != 1 || !strings.HasPrefix(header[0], "queue;dur=") || !strings.Contains(header[0], ", native;dur=") {
			t.Fatalf("missing or duplicated service timing: %v", header)
		}
		if strings.Contains(header[0], "synthetic") {
			t.Fatal("error detail leaked into timing")
		}
	}
}

func TestServiceValidationDoesNotInventNativeTiming(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(timedAPI{}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(`{}`)))
	if response.Code != http.StatusBadRequest || response.Header().Get("Server-Timing") != "" {
		t.Fatalf("validation must not claim queue or native measurements: %d %v", response.Code, response.Header())
	}
}

type countingResponseWriter struct {
	*httptest.ResponseRecorder
	statuses []int
}

func (w *countingResponseWriter) WriteHeader(code int) {
	w.statuses = append(w.statuses, code)
	w.ResponseRecorder.WriteHeader(code)
}

func TestTimingWriterCommitsResponseOnce(t *testing.T) {
	underlying := &countingResponseWriter{ResponseRecorder: httptest.NewRecorder()}
	w := &timingWriter{ResponseWriter: underlying, timing: &workerTiming{queueRecorded: true}}
	w.WriteHeader(http.StatusCreated)
	w.WriteHeader(http.StatusInternalServerError)
	_, _ = w.Write([]byte("ok"))
	if len(underlying.statuses) != 1 || underlying.Code != http.StatusCreated || underlying.Body.String() != "ok" {
		t.Fatalf("duplicate final response: %#v", underlying)
	}
	if got := underlying.Header().Get("Server-Timing"); got != "queue;dur=0.000" {
		t.Fatalf("unknown native time must be omitted: %q", got)
	}
}
