package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestObserveRequestsUsesStablePatternAndOmitsSensitiveRequestData(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/game/entities/{id}", func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusServiceUnavailable)
		_, _ = writer.Write([]byte("unavailable"))
	})
	handler := ObserveRequests(mux, logger)
	request := httptest.NewRequest(http.MethodGet,
		"/v1/game/entities/private-entity-id?token=must-not-appear", nil)
	request.Header.Set("Authorization", "Bearer must-not-appear")
	request.AddCookie(&http.Cookie{Name: "session", Value: "must-not-appear"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable || response.Body.String() != "unavailable" {
		t.Fatalf("response status=%d body=%q", response.Code, response.Body.String())
	}
	if strings.Contains(output.String(), "must-not-appear") || strings.Contains(output.String(), "private-entity-id") {
		t.Fatalf("structured log leaked request data: %s", output.String())
	}
	var event map[string]any
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event["level"] != "ERROR" || event["method"] != http.MethodGet ||
		event["route"] != "GET /v1/game/entities/{id}" || event["status"] != float64(http.StatusServiceUnavailable) ||
		event["response_bytes"] != float64(len("unavailable")) {
		t.Fatalf("unexpected structured event: %#v", event)
	}
}

func TestObserveRequestsPreservesResponseControllerUnwrap(t *testing.T) {
	underlying := httptest.NewRecorder()
	response := &observedResponse{ResponseWriter: underlying}
	controller := http.NewResponseController(response)
	if err := controller.SetWriteDeadline(time.Time{}); err == nil {
		t.Fatal("httptest recorder unexpectedly accepted a write deadline")
	}
	if response.Unwrap() != underlying {
		t.Fatal("response writer did not expose the underlying writer")
	}
}

func TestCaptureHTTPFailureWithoutSentryClientIsSafe(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(context.Background())
	captureHTTPFailure(request, "GET /", http.StatusInternalServerError)
}

func TestObserveRequestsSeesThePatternBehindMaxBytesHandler(t *testing.T) {
	var output bytes.Buffer
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/game/entity-summaries", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})
	// The production order (cmd/server): the body limit wraps the observer, so
	// the observer and the router share one request and the pattern survives.
	handler := http.MaxBytesHandler(ObserveRequests(mux, slog.New(slog.NewJSONHandler(&output, nil))), 8<<20)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/game/entity-summaries?q=x", nil))
	var event map[string]any
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event["route"] != "GET /v1/game/entity-summaries" {
		t.Fatalf("route = %v, want the matched pattern", event["route"])
	}
}

func TestObserveRequestsReportsAbandonedRequestsAs499(t *testing.T) {
	var output bytes.Buffer
	ctx, cancel := context.WithCancel(context.Background())
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/game/entity-summaries", func(writer http.ResponseWriter, _ *http.Request) {
		cancel() // the frontend's AbortSignal fired while the query ran
		writer.WriteHeader(http.StatusInternalServerError)
	})
	handler := ObserveRequests(mux, slog.New(slog.NewJSONHandler(&output, nil)))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/game/entity-summaries", nil).WithContext(ctx))
	var event map[string]any
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event["level"] != "WARN" || event["status"] != float64(statusClientClosedRequest) {
		t.Fatalf("abandoned request logged as %#v, want WARN with status 499", event)
	}
}
