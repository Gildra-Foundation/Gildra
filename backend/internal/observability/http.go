package observability

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

type contextKey struct{}

func Configure(service string) {
	level := new(slog.LevelVar)
	switch strings.ToUpper(strings.TrimSpace(os.Getenv("LOG_LEVEL"))) {
	case "DEBUG":
		level.Set(slog.LevelDebug)
	case "WARN", "WARNING":
		level.Set(slog.LevelWarn)
	case "ERROR":
		level.Set(slog.LevelError)
	default:
		level.Set(slog.LevelInfo)
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			key := strings.ToLower(attr.Key)
			for _, fragment := range []string{"authorization", "cookie", "password", "secret", "token", "api_key"} {
				if strings.Contains(key, fragment) {
					return slog.String(attr.Key, "[REDACTED]")
				}
			}
			return attr
		},
	})
	slog.SetDefault(slog.New(handler).With("service", service))
}

func RequestID(ctx context.Context) string {
	value, _ := ctx.Value(contextKey{}).(string)
	return value
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (writer *responseRecorder) WriteHeader(status int) {
	if writer.status != 0 {
		return
	}
	writer.status = status
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *responseRecorder) Write(body []byte) (int, error) {
	if writer.status == 0 {
		writer.status = http.StatusOK
	}
	written, err := writer.ResponseWriter.Write(body)
	writer.bytes += written
	return written, err
}

func (writer *responseRecorder) Unwrap() http.ResponseWriter { return writer.ResponseWriter }

func HTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		started := time.Now()
		requestID := uuid.NewString()
		writer.Header().Set("X-Request-ID", requestID)
		ctx := context.WithValue(request.Context(), contextKey{}, requestID)
		request = request.WithContext(ctx)
		recorder := &responseRecorder{ResponseWriter: writer}

		defer func() {
			panicValue := recover()
			status := recorder.status
			if status == 0 {
				status = http.StatusOK
			}
			if panicValue != nil {
				status = http.StatusInternalServerError
			}
			duration := time.Since(started)
			path := request.Pattern
			if path == "" {
				path = request.URL.Path
			}
			if !((path == "/livez" || path == "/readyz") && status < 400) {
				level := slog.LevelInfo
				if status >= 500 || panicValue != nil {
					level = slog.LevelError
				} else if status >= 400 || duration >= 2*time.Second {
					level = slog.LevelWarn
				}
				slog.LogAttrs(
					ctx,
					level,
					"http_request_completed",
					slog.String("event", "http_request_completed"),
					slog.String("request_id", requestID),
					slog.String("method", request.Method),
					slog.String("route", path),
					slog.Int("status", status),
					slog.Int64("duration_ms", duration.Milliseconds()),
					slog.Int("response_bytes", recorder.bytes),
				)
			}
			if panicValue != nil {
				panic(panicValue)
			}
		}()

		next.ServeHTTP(recorder, request)
	})
}
