// Package httpapi serves the OpenAPI contract (api.StrictServerInterface).
// Server is split by domain: catalog_handlers.go, analytics_handlers.go and
// indexnow_handlers.go; this file holds construction, the index and health.
package httpapi

import (
	"context"
	"errors"

	"github.com/Gildra-Foundation/Gildra/backend/internal/analytics"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

type Server struct {
	analytics *analytics.Service
	catalog   *catalog.Service
	indexnow  IndexNowQueue
}

// ExecuteGraphQL and GetCatalogMedia are mounted by the server bootstrap as
// dedicated handlers (GraphQL's gqlgen handler and the integrity-checked
// media handler). They still satisfy the generated OpenAPI interface so the
// contract can document those routes without allowing the generic REST
// router to bypass their middleware.
func (s *Server) ExecuteGraphQL(context.Context, api.ExecuteGraphQLRequestObject) (api.ExecuteGraphQLResponseObject, error) {
	return nil, errors.New("graphql is served by the dedicated GraphQL handler")
}

func (s *Server) GetCatalogMedia(context.Context, api.GetCatalogMediaRequestObject) (api.GetCatalogMediaResponseObject, error) {
	return nil, errors.New("media is served by the dedicated media handler")
}

func NewServer(analyticsService *analytics.Service, catalogService *catalog.Service, indexnowQueue IndexNowQueue) *Server {
	return &Server{analytics: analyticsService, catalog: catalogService, indexnow: indexnowQueue}
}
func (s *Server) GetAPIIndex(_ context.Context, request api.GetAPIIndexRequestObject) (api.GetAPIIndexResponseObject, error) {
	product := "wow"
	// Nginx translates a canonical edition prefix into this query parameter.
	// A direct /v1 request without it remains the Retail default.
	if request.Params.Product != nil {
		product = string(*request.Params.Product)
	}
	edition := "retail"
	switch product {
	case "wow_classic":
		edition = "classic"
	case "wow_classic_era":
		edition = "classic-era"
	case "wow_classic_hardcore":
		edition = "hardcore"
	}
	base := "https://api.gildra.net/world-of-warcraft/" + edition + "/v1"
	return api.GetAPIIndex200JSONResponse{
		Version: api.V1,
		Rest:    base + "/",
		Graphql: "https://api.gildra.net/graphql",
		Catalog: base + "/game/entities",
		Library: base + "/library/datasets",
	}, nil
}

func notFoundProblem(detail string) api.NotFoundApplicationProblemPlusJSONResponse {
	return api.NotFoundApplicationProblemPlusJSONResponse{Type: "https://api.gildra.net/errors/not-found", Title: "Not Found", Status: 404, Detail: &detail}
}

func (s *Server) GetLiveness(context.Context, api.GetLivenessRequestObject) (api.GetLivenessResponseObject, error) {
	return api.GetLiveness200JSONResponse{Status: api.Ok}, nil
}

func (s *Server) GetReadiness(ctx context.Context, _ api.GetReadinessRequestObject) (api.GetReadinessResponseObject, error) {
	if err := s.analytics.Ready(ctx); err != nil {
		return api.GetReadiness503JSONResponse{Code: "not_ready", Message: err.Error()}, nil
	}
	return api.GetReadiness200JSONResponse{Status: api.Ok}, nil
}
