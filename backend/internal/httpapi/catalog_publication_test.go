package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

type fakePublicationEvaluator struct {
	status catalog.PublicationStatus
	err    error
}

func (f fakePublicationEvaluator) Status(context.Context, string, string) (catalog.PublicationStatus, error) {
	return f.status, f.err
}

func TestEnforceCatalogPublicationBlocksCatalogAndGraphQL(t *testing.T) {
	evaluator := fakePublicationEvaluator{status: catalog.PublicationStatus{Ready: false, Sources: []catalog.PublicationSource{{Source: "wago_tools", Allowed: false}}}}
	handler := EnforceCatalogPublication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), evaluator, "enforce", "production")
	for _, path := range []string{"/v1/game/entity-summaries", "/v1/library/datasets", "/graphql"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: expected 503, got %d", path, response.Code)
		}
		if response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: blocked response must not be cached", path)
		}
	}
}

func TestReportCatalogPublicationPreservesLocalCatalog(t *testing.T) {
	evaluator := fakePublicationEvaluator{status: catalog.PublicationStatus{Ready: false, Sources: []catalog.PublicationSource{{Allowed: false}}}}
	handler := EnforceCatalogPublication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), evaluator, "report", "development")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/game/entities", nil))
	if response.Code != http.StatusNoContent || response.Header().Get("X-Gildra-Blocked-Sources") != "1" {
		t.Fatalf("unexpected report response: status=%d headers=%v", response.Code, response.Header())
	}
}

func TestPublicationPolicyEndpointRemainsInspectable(t *testing.T) {
	handler := EnforceCatalogPublication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), fakePublicationEvaluator{err: errors.New("unavailable")}, "enforce", "production")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/game/source-policies", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("expected source policies to remain available, got %d", response.Code)
	}
}
