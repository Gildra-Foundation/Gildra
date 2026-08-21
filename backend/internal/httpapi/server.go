package httpapi

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/analytics"
	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

type IndexNowQueue interface {
	Submit(context.Context, []string) error
}

type Server struct {
	analytics *analytics.Service
	catalog   *catalog.Service
	indexnow  IndexNowQueue
}

func NewServer(analyticsService *analytics.Service, catalogService *catalog.Service, indexnowQueue IndexNowQueue) *Server {
	return &Server{analytics: analyticsService, catalog: catalogService, indexnow: indexnowQueue}
}

func (s *Server) GetAPIIndex(context.Context, api.GetAPIIndexRequestObject) (api.GetAPIIndexResponseObject, error) {
	return api.GetAPIIndex200JSONResponse{
		Version: api.V1,
		Rest:    "https://api.gildra.net/v1/",
		Graphql: "https://api.gildra.net/graphql",
	}, nil
}

func (s *Server) ListGameProducts(ctx context.Context, _ api.ListGameProductsRequestObject) (api.ListGameProductsResponseObject, error) {
	products, err := s.catalog.Products(ctx)
	if err != nil {
		return api.ListGameProducts500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	response := make([]api.GameProduct, 0, len(products))
	for _, product := range products {
		response = append(response, api.GameProduct{Id: product.ID, Slug: product.Slug, Name: product.Name})
	}
	return api.ListGameProducts200JSONResponse{Data: response}, nil
}

func (s *Server) ListGameEntities(ctx context.Context, request api.ListGameEntitiesRequestObject) (api.ListGameEntitiesResponseObject, error) {
	limit := 20
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	params := catalog.ListParams{Limit: limit, Locale: locale}
	if request.Params.Product != nil {
		params.Product = *request.Params.Product
	}
	if request.Params.Type != nil {
		params.Type = *request.Params.Type
	}
	if request.Params.Q != nil {
		params.Query = *request.Params.Q
	}
	if request.Params.Cursor != nil {
		params.Cursor = *request.Params.Cursor
	}
	page, err := s.catalog.List(ctx, params)
	if err != nil {
		if strings.Contains(err.Error(), "cursor") || strings.Contains(err.Error(), "limit") {
			return api.ListGameEntities400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_page", Message: err.Error(),
			}}, nil
		}
		return api.ListGameEntities500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	entities := make([]api.GameEntity, 0, len(page.Entities))
	for _, entity := range page.Entities {
		entities = append(entities, toAPIEntity(entity))
	}
	pagination := api.CursorPage{HasMore: page.HasMore}
	if page.NextCursor != "" {
		pagination.NextCursor = &page.NextCursor
	}
	return api.ListGameEntities200JSONResponse{Data: entities, Pagination: pagination}, nil
}

func (s *Server) GetGameEntity(ctx context.Context, request api.GetGameEntityRequestObject) (api.GetGameEntityResponseObject, error) {
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	entity, err := s.catalog.Get(ctx, request.Id, locale)
	if errors.Is(err, catalog.ErrNotFound) {
		return api.GetGameEntity404ApplicationProblemPlusJSONResponse{
			NotFoundApplicationProblemPlusJSONResponse: api.NotFoundApplicationProblemPlusJSONResponse{
				Type: "https://api.gildra.net/errors/not-found", Title: "Not Found", Status: 404,
				Detail: new("The requested game entity does not exist."),
			},
		}, nil
	}
	if err != nil {
		return api.GetGameEntity500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	return api.GetGameEntity200JSONResponse(toAPIEntity(entity)), nil
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

func (s *Server) IngestAnalyticsEvents(ctx context.Context, request api.IngestAnalyticsEventsRequestObject) (api.IngestAnalyticsEventsResponseObject, error) {
	if request.Body == nil || len(request.Body.Events) == 0 || len(request.Body.Events) > 5000 {
		return api.IngestAnalyticsEvents400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
			Code: "invalid_events", Message: "events must contain between 1 and 5000 items",
		}}, nil
	}
	for index, event := range request.Body.Events {
		if event.EventName == "" || len(event.EventName) > 100 || !event.Locale.Valid() || len(event.Path) > 2048 {
			return api.IngestAnalyticsEvents400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_event", Message: fmt.Sprintf("event %d has invalid fields", index),
			}}, nil
		}
	}
	if err := s.analytics.Ingest(ctx, request.Body.Events); err != nil {
		return api.IngestAnalyticsEvents500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "ingest_failed", Message: "analytics ingestion is temporarily unavailable",
		}}, nil
	}
	return api.IngestAnalyticsEvents202JSONResponse{Accepted: len(request.Body.Events)}, nil
}

func (s *Server) GetAnalyticsOverview(ctx context.Context, request api.GetAnalyticsOverviewRequestObject) (api.GetAnalyticsOverviewResponseObject, error) {
	hours := 24
	if request.Params.Hours != nil {
		hours = *request.Params.Hours
	}
	if hours < 1 || hours > 720 {
		return nil, errors.New("hours must be between 1 and 720")
	}
	overview, err := s.analytics.Overview(ctx, hours)
	if err != nil {
		return api.GetAnalyticsOverview500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "overview_failed", Message: "analytics overview is temporarily unavailable",
		}}, nil
	}
	return api.GetAnalyticsOverview200JSONResponse(overview), nil
}

func (s *Server) SubmitIndexNow(ctx context.Context, request api.SubmitIndexNowRequestObject) (api.SubmitIndexNowResponseObject, error) {
	if request.Body == nil || len(request.Body.Urls) == 0 || len(request.Body.Urls) > 10_000 {
		return api.SubmitIndexNow400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
			Code: "invalid_urls", Message: "urls must contain between 1 and 10000 items",
		}}, nil
	}
	if err := s.indexnow.Submit(ctx, request.Body.Urls); err != nil {
		return api.SubmitIndexNow400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
			Code: "invalid_url", Message: err.Error(),
		}}, nil
	}
	return api.SubmitIndexNow202JSONResponse{Queued: true}, nil
}

func toAPIEntity(entity catalog.Entity) api.GameEntity {
	return api.GameEntity{
		Id: entity.ID, Product: entity.Product, Type: entity.Type,
		ExternalId: entity.ExternalID, Slug: entity.Slug,
		Locale: api.GameEntityLocale(entity.Locale), Name: entity.Name,
		Description: entity.Description, BuildId: entity.BuildID,
		Payload: entity.Payload, UpdatedAt: entity.UpdatedAt,
	}
}

//go:fix inline
func pointer[T any](value T) *T { return new(value) }
