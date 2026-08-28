package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/getsentry/sentry-go"
)

type observedResponse struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (response *observedResponse) WriteHeader(status int) {
	if response.status != 0 {
		return
	}
	response.status = status
	response.ResponseWriter.WriteHeader(status)
}

func (response *observedResponse) Write(payload []byte) (int, error) {
	if response.status == 0 {
		response.WriteHeader(http.StatusOK)
	}
	written, err := response.ResponseWriter.Write(payload)
	response.bytes += written
	return written, err
}

func (response *observedResponse) Unwrap() http.ResponseWriter {
	return response.ResponseWriter
}

// ObserveRequests records one bounded, structured event per HTTP request. It
// intentionally excludes the raw URL, query string, headers, cookies, body,
// remote address and user identity. The ServeMux pattern is a fixed route
// template and therefore safe for aggregation without high-cardinality labels.
func ObserveRequests(next http.Handler, logger *slog.Logger) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		response := &observedResponse{ResponseWriter: writer}
		next.ServeHTTP(response, request)
		if response.status == 0 {
			response.status = http.StatusOK
		}
		pattern := request.Pattern
		if pattern == "" {
			pattern = "unmatched"
		}
		attributes := []any{
			"method", request.Method,
			"route", pattern,
			"status", response.status,
			"duration_ms", time.Since(started).Milliseconds(),
			"response_bytes", response.bytes,
		}
		switch {
		case response.status >= http.StatusInternalServerError:
			logger.Error("http request completed", attributes...)
			captureHTTPFailure(request, pattern, response.status)
		case response.status >= http.StatusBadRequest:
			logger.Warn("http request completed", attributes...)
		default:
			logger.Info("http request completed", attributes...)
		}
	})
}

func captureHTTPFailure(request *http.Request, pattern string, status int) {
	hub := sentry.GetHubFromContext(request.Context())
	if hub == nil || hub.Client() == nil {
		return
	}
	hub.WithScope(func(scope *sentry.Scope) {
		scope.SetTag("http.method", request.Method)
		scope.SetTag("http.route", pattern)
		scope.SetTag("http.status_code", strconv.Itoa(status))
		hub.CaptureMessage("HTTP request returned a server error")
	})
}
