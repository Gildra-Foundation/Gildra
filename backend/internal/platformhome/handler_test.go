package platformhome

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeStore struct {
	payload json.RawMessage
	err     error
	locale  string
}

func (f *fakeStore) Snapshot(_ context.Context, locale string) (json.RawMessage, error) {
	f.locale = locale
	return f.payload, f.err
}

func TestGetHomeReturnsPublishedSnapshot(t *testing.T) {
	store := &fakeStore{payload: json.RawMessage(`{"title":"Your worlds"}`)}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)

	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/platform/home?locale=ru_RU", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if store.locale != "ru_RU" {
		t.Fatalf("locale = %q, want ru_RU", store.locale)
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestGetHomeRejectsUnknownLocale(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/platform/home?locale=fr_FR", nil))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestGetHomeMapsMissingSnapshotToNotFound(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{err: ErrSnapshotNotFound}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/platform/home", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestGetHomeHidesStoreErrors(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{err: errors.New("database details")}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/platform/home", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}
}
