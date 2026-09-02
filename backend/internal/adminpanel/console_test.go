package adminpanel

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestComputeFreshness(t *testing.T) {
	now := time.Date(2026, 9, 2, 12, 0, 0, 0, time.UTC)
	if status, until := computeFreshness(now, nil, time.Hour); status != "never" || until != nil {
		t.Fatalf("no success: status=%q until=%v", status, until)
	}
	success := now.Add(-30 * time.Minute)
	status, until := computeFreshness(now, &success, time.Hour)
	if status != "fresh" || until == nil || !until.Equal(success.Add(time.Hour)) {
		t.Fatalf("within interval: status=%q until=%v", status, until)
	}
	old := now.Add(-2 * time.Hour)
	if status, until := computeFreshness(now, &old, time.Hour); status != "stale" || until == nil || !until.Equal(old.Add(time.Hour)) {
		t.Fatalf("after interval: status=%q until=%v", status, until)
	}
}

// Every console route must reject anonymous requests before touching any
// backing store; the handler here has no clients at all.
func TestConsoleRoutesRequireSession(t *testing.T) {
	mux := http.NewServeMux()
	(&Handler{}).Register(mux)
	for _, path := range []string{
		"/v1/admin/system", "/v1/admin/catalog-health", "/v1/admin/analytics-overview",
		"/v1/admin/endpoints", "/v1/admin/datasets", "/v1/admin/datasets/tierlist-wowhead",
		"/v1/admin/datasets/tierlist-wowhead/freshness", "/v1/admin/datasets/tierlist-wowhead/runs",
		"/v1/admin/dashboard",
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s status=%d, want 401", path, response.Code)
		}
		var problem map[string]string
		if err := json.Unmarshal(response.Body.Bytes(), &problem); err != nil || problem["code"] != "unauthorized" {
			t.Fatalf("%s body=%s", path, response.Body.String())
		}
	}
}

func TestSystemStatusesReportMissingClientsAsDegraded(t *testing.T) {
	statuses := (&Handler{}).systemStatuses(t.Context())
	if len(statuses) != 4 || statuses[0].Name != "API" || statuses[0].Status != "operational" {
		t.Fatalf("statuses=%#v", statuses)
	}
	for _, item := range statuses[1:] {
		if item.Status != "degraded" {
			t.Fatalf("%s without a client must be degraded, got %#v", item.Name, item)
		}
	}
}

func TestConsoleEndpointsKeepEditionBases(t *testing.T) {
	found := false
	for _, endpoint := range consoleEndpoints {
		if endpoint.Method == "" || endpoint.Path == "" || endpoint.Description == "" {
			t.Fatalf("incomplete endpoint %#v", endpoint)
		}
		if strings.HasPrefix(endpoint.Path, "/world-of-warcraft/{retail|classic|classic-era|hardcore}/v1") {
			found = true
		}
	}
	if !found {
		t.Fatal("the edition-scoped API bases must stay documented")
	}
}
