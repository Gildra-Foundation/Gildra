// Package httpjson writes JSON and RFC 9457 problem responses for the
// handlers that are not generated from the OpenAPI contract, so every
// package sends the same content type and nosniff header.
package httpjson

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Cache-Control values shared by the handlers.
const (
	NoStore        = "no-store"
	PrivateNoStore = "private, no-store"
)

// Problem is an RFC 9457 problem document.
type Problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance"`
}

// Write sends value as application/json. cacheControl is set when not empty.
func Write(w http.ResponseWriter, status int, cacheControl string, value any) {
	write(w, "application/json; charset=utf-8", status, cacheControl, value)
}

// WriteProblem sends value (usually a Problem) as application/problem+json.
// cacheControl is set when not empty.
func WriteProblem(w http.ResponseWriter, status int, cacheControl string, value any) {
	write(w, "application/problem+json", status, cacheControl, value)
}

func write(w http.ResponseWriter, contentType string, status int, cacheControl string, value any) {
	w.Header().Set("Content-Type", contentType)
	if cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		// The status line is already sent; the client sees a truncated body.
		slog.Warn("encode JSON response", "status", status, "error", err)
	}
}
