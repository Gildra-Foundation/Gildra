package gamemeta

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeStore struct {
	snapshot Snapshot
	err      error
	query    Query
}

func (f *fakeStore) WoWTierList(_ context.Context, query Query) (Snapshot, error) {
	f.query = query
	return f.snapshot, f.err
}

func (f *fakeStore) WoWTierListContexts(_ context.Context, _ string) ([]Context, error) {
	return []Context{{Activity: "mythic_plus", SelectionType: "all", SelectionID: "all", SelectionName: "All dungeons", AddonKey: "midnight", AddonName: "Midnight"}}, f.err
}

func TestWoWTierListReturnsPublicSnapshot(t *testing.T) {
	store := &fakeStore{snapshot: Snapshot{Game: "wow", Status: "live", UpdatedAt: time.Now(), Entries: []Entry{{Rank: 1, Tier: "S", SpecName: "Demonology"}}}}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list?role=healer&limit=7", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if store.query.Activity != "mythic_plus" || store.query.Role != "healer" || store.query.Limit != 7 {
		t.Fatalf("query = %#v", store.query)
	}
	if response.Header().Get("Cache-Control") == "" {
		t.Fatal("public response is missing Cache-Control")
	}
}

func TestWoWTierListRejectsInvalidFilters(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	for _, target := range []string{
		"/v1/meta/wow/tier-list?activity=pvp",
		"/v1/meta/wow/tier-list?role=all",
		"/v1/meta/wow/tier-list?limit=1000",
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want %d", target, response.Code, http.StatusBadRequest)
		}
	}
}

func TestWoWTierListMapsUnavailableStates(t *testing.T) {
	for _, test := range []struct {
		err  error
		want int
	}{{ErrSnapshotNotFound, http.StatusNotFound}, {errors.New("database unavailable"), http.StatusServiceUnavailable}} {
		mux := http.NewServeMux()
		NewHandler(&fakeStore{err: test.err}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list", nil))
		if response.Code != test.want {
			t.Fatalf("status = %d, want %d", response.Code, test.want)
		}
	}
}

func TestWoWTierListAcceptsSpecificContext(t *testing.T) {
	store := &fakeStore{snapshot: Snapshot{Game: "wow", Status: "live", Entries: []Entry{{Rank: 1, Tier: "S", SpecName: "Demonology"}}}}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list?activity=raid&role=dps&selectionType=raid&selectionId=1307&difficulty=raid_myth", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if store.query.SelectionType != "raid" || store.query.SelectionID != "1307" || store.query.Difficulty != "raid_myth" {
		t.Fatalf("query = %#v", store.query)
	}
}

func TestWoWTierListContexts(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list/contexts?activity=mythic_plus", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
}
