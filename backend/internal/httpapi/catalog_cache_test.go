package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCachePublicCatalogAddsValidatorAndHonorsConditionalRequest(t *testing.T) {
	t.Parallel()
	handler := CachePublicCatalog(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/v1/game/entity-summaries", nil))
	if first.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", first.Code)
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected ETag")
	}
	if got := first.Header().Get("Cache-Control"); got == "" {
		t.Fatal("expected Cache-Control")
	}
	secondRequest := httptest.NewRequest(http.MethodGet, "/v1/game/entity-summaries", nil)
	secondRequest.Header.Set("If-None-Match", etag)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, secondRequest)
	if second.Code != http.StatusNotModified || second.Body.Len() != 0 {
		t.Fatalf("conditional response = %d, %q; want 304 with empty body", second.Code, second.Body.String())
	}
}

func TestCachePublicCatalogDoesNotCacheMutations(t *testing.T) {
	t.Parallel()
	handler := CachePublicCatalog(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/game/source-policies", nil))
	if response.Header().Get("ETag") != "" || response.Header().Get("Cache-Control") != "" {
		t.Fatal("mutation response must not receive public cache headers")
	}
}

func TestCachePublicCatalogPreservesPrivateResponses(t *testing.T) {
	t.Parallel()
	handler := CachePublicCatalog(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"private"}]}`))
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/game/entities", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
	if got := strings.ToLower(response.Header().Get("Cache-Control")); got != "private, no-store" {
		t.Fatalf("Cache-Control = %q, want private, no-store", got)
	}
	if response.Header().Get("ETag") != "" {
		t.Fatal("private response must not receive a shared-cache validator")
	}
}
