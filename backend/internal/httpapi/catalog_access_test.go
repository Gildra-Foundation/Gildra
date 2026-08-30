package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/auth"
)

type fakeCatalogAuthenticator struct {
	token string
}

func (f fakeCatalogAuthenticator) Authenticate(_ context.Context, token string) (auth.User, error) {
	if token != f.token {
		return auth.User{}, errors.New("invalid session")
	}
	return auth.User{Role: "admin"}, nil
}

func TestPrivateCatalogRequiresValidAdminSession(t *testing.T) {
	handler := RequireCatalogAuthentication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), fakeCatalogAuthenticator{token: "valid-token"}, "private")

	for _, path := range []string{"/v1/game/products", "/v1/game/entities", "/v1/library/datasets", "/v1/media/asset-id", "/graphql"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusUnauthorized || response.Header().Get("Cache-Control") != "private, no-store" {
			t.Fatalf("%s: unauthenticated response=%d headers=%v", path, response.Code, response.Header())
		}

		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.AddCookie(&http.Cookie{Name: catalogSessionCookie, Value: "valid-token"})
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent || response.Header().Get("Cache-Control") != "private, no-store" {
			t.Fatalf("%s: authenticated response=%d headers=%v", path, response.Code, response.Header())
		}
	}
}

func TestPrivateCatalogLeavesOperationalRoutesUntouched(t *testing.T) {
	handler := RequireCatalogAuthentication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), fakeCatalogAuthenticator{}, "private")
	for _, path := range []string{"/livez", "/readyz", "/v1/auth/login", "/v1/admin/dashboard", "/v1/analytics/events"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusNoContent {
			t.Fatalf("%s: operational route status=%d", path, response.Code)
		}
	}
}

func TestPublicCatalogDoesNotRequireSession(t *testing.T) {
	handler := RequireCatalogAuthentication(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), fakeCatalogAuthenticator{}, "public")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/game/entities", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("public catalog status=%d", response.Code)
	}
}
