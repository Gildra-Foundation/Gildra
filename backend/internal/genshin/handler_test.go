package genshin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubCatalog struct {
	status Status
}

func (s stubCatalog) Status(context.Context) (Status, error) {
	return s.status, nil
}

func (stubCatalog) ListCharacters(context.Context, ListParams) (Page[CharacterSummary], error) {
	return Page[CharacterSummary]{Data: []CharacterSummary{}, Pagination: Pagination{Limit: 24}}, nil
}

func (stubCatalog) ListWeapons(context.Context, ListParams) (Page[WeaponSummary], error) {
	return Page[WeaponSummary]{Data: []WeaponSummary{}, Pagination: Pagination{Limit: 24}}, nil
}

func (stubCatalog) ListArtifactSets(context.Context, ListParams) (Page[ArtifactSetSummary], error) {
	return Page[ArtifactSetSummary]{Data: []ArtifactSetSummary{}, Pagination: Pagination{Limit: 24}}, nil
}

func TestStatusReturnsCatalogState(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	NewHandler(stubCatalog{status: Status{Ready: true, Characters: 92, Locales: []string{"en_US", "ru_RU"}}}).Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, apiBase+"/status", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var response Status
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if !response.Ready || response.Characters != 92 {
		t.Fatalf("response = %#v", response)
	}
}

func TestCharactersRejectsUnsupportedLocale(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	NewHandler(stubCatalog{}).Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, apiBase+"/characters?locale=de_DE", nil))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Fatalf("content type = %q", got)
	}
}

func TestCursorRoundTrip(t *testing.T) {
	t.Parallel()
	want := "staff-of-homa"
	got, err := decodeCursor(encodeCursor(want))
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("cursor = %q, want %q", got, want)
	}
}

func TestCursorRejectsArbitraryValue(t *testing.T) {
	t.Parallel()
	if _, err := decodeCursor("not-a-valid-base64-cursor!"); !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("error = %v, want ErrInvalidCursor", err)
	}
}
