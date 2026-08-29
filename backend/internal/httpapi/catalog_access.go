package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/auth"
)

const catalogSessionCookie = "gildra_admin_session"

type CatalogSessionAuthenticator interface {
	Authenticate(context.Context, string) (auth.User, error)
}

// RequireCatalogAuthentication keeps developer-source catalog data behind the
// existing administrator session when private mode is selected. Health,
// authentication, analytics and dataset administration routes are left to
// their existing handlers.
func RequireCatalogAuthentication(next http.Handler, authenticator CatalogSessionAuthenticator, accessMode string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if accessMode != "private" || !isPrivateCatalogPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie(catalogSessionCookie)
		if err != nil || cookie.Value == "" {
			writeCatalogUnauthorized(w)
			return
		}
		if _, err := authenticator.Authenticate(r.Context(), cookie.Value); err != nil {
			writeCatalogUnauthorized(w)
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		next.ServeHTTP(w, r)
	})
}

func isPrivateCatalogPath(path string) bool {
	return path == "/graphql" || strings.HasPrefix(path, "/v1/game/") ||
		strings.HasPrefix(path, "/v1/library/") || strings.HasPrefix(path, "/v1/media/")
}

func writeCatalogUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type":   "https://api.gildra.net/errors/catalog-authentication-required",
		"title":  "Catalog authentication required",
		"status": http.StatusUnauthorized,
		"code":   "catalog_authentication_required",
		"detail": "Sign in to the Gildra API console to access the private catalog.",
	})
}
