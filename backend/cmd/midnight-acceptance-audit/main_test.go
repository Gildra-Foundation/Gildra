package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchCachedMediaRequiresPublicImage(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		status      int
		contentType string
		wantError   string
	}{
		{name: "cached image", status: http.StatusOK, contentType: "image/jpeg"},
		{name: "missing image", status: http.StatusNotFound, contentType: "text/plain", wantError: "HTTP 404"},
		{name: "html response", status: http.StatusOK, contentType: "text/html", wantError: "not an image"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				writer.Header().Set("Content-Type", test.contentType)
				writer.WriteHeader(test.status)
			}))
			defer server.Close()
			err := fetchCachedMedia(context.Background(), server.Client(), map[string]any{"iconUrl": server.URL + "/v1/media/icon"})
			if test.wantError == "" && err != nil {
				t.Fatalf("fetchCachedMedia() = %v", err)
			}
			if test.wantError != "" && (err == nil || !strings.Contains(err.Error(), test.wantError)) {
				t.Fatalf("fetchCachedMedia() = %v, want %q", err, test.wantError)
			}
		})
	}
}
