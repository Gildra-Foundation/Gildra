// Analytics endpoints of the OpenAPI contract: event ingestion and overview.

package httpapi

import (
	"context"
	"errors"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
)

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
