// IndexNow endpoint of the OpenAPI contract: queue changed URLs for search engines.

package httpapi

import (
	"context"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
)

type IndexNowQueue interface {
	Submit(context.Context, []string) error
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
