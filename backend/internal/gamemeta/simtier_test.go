package gamemeta

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const simTierPayload = `{"schema_version":1,"tables":[]}`

func (f *fakeStore) WoWSimTierList(_ context.Context) (SimTierList, error) {
	return SimTierList{Game: "wow", Status: "live", Data: []byte(simTierPayload)}, f.err
}

func TestWoWSimTierListServesTheStoredPayload(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list/sim", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if body := response.Body.String(); !strings.Contains(body, `"data":`+simTierPayload) {
		t.Fatalf("body = %s", body)
	}
	if response.Header().Get("Cache-Control") != publicMetaCache {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestWoWSimTierListMapsMissingAndFailingSnapshots(t *testing.T) {
	for _, test := range []struct {
		err  error
		want int
	}{{ErrSnapshotNotFound, http.StatusNotFound}, {errors.New("database down"), http.StatusServiceUnavailable}} {
		mux := http.NewServeMux()
		NewHandler(&fakeStore{err: test.err}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list/sim", nil))
		if response.Code != test.want {
			t.Fatalf("%v: status = %d, want %d", test.err, response.Code, test.want)
		}
	}
}

func TestSimTierListTurnsStaleAfterThreeDays(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	fresh, old := now.Add(-30*time.Hour), now.Add(-73*time.Hour)
	if got := simTierStatus(&fresh, now); got != "live" {
		t.Fatalf("fresh status = %q", got)
	}
	if got := simTierStatus(&old, now); got != "stale" {
		t.Fatalf("old status = %q", got)
	}
	if got := simTierStatus(nil, now); got != "stale" {
		t.Fatalf("unchecked status = %q", got)
	}
}
