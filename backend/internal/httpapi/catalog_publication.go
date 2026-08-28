package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

type PublicationEvaluator interface {
	Status(context.Context, string, string) (catalog.PublicationStatus, error)
}

// EnforceCatalogPublication guards every public catalog delivery path. Report
// mode is intended for local development; enforce mode fails closed.
func EnforceCatalogPublication(next http.Handler, evaluator PublicationEvaluator, mode, environment string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isCatalogDeliveryPath(r.URL.Path) || mode == "off" {
			next.ServeHTTP(w, r)
			return
		}
		status, err := evaluator.Status(r.Context(), environment, "public_api")
		if err != nil {
			if mode != "enforce" {
				w.Header().Set("X-Gildra-Publication-Policy", "report-unavailable")
				slog.Warn("catalog publication policy unavailable", "error", err)
				next.ServeHTTP(w, r)
				return
			}
			writePublicationProblem(w, "catalog_publication_policy_unavailable", "Publication policy could not be verified.")
			return
		}
		blocked := 0
		for _, source := range status.Sources {
			if !source.Allowed {
				blocked++
			}
		}
		w.Header().Set("X-Gildra-Publication-Policy", mode)
		w.Header().Set("X-Gildra-Blocked-Sources", strconv.Itoa(blocked))
		if mode == "enforce" && !status.Ready {
			writePublicationProblem(w, "catalog_publication_blocked", "Catalog publication is blocked until every contributing source has a current policy and explicit grant.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isCatalogDeliveryPath(path string) bool {
	if path == "/graphql" {
		return true
	}
	if strings.HasPrefix(path, "/v1/library/") {
		return true
	}
	return strings.HasPrefix(path, "/v1/game/") && path != "/v1/game/source-policies"
}

func writePublicationProblem(w http.ResponseWriter, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusServiceUnavailable)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type":  "https://api.gildra.net/errors/" + strings.ReplaceAll(code, "_", "-"),
		"title": "Catalog publication unavailable", "status": http.StatusServiceUnavailable,
		"code": code, "detail": detail,
	})
}
