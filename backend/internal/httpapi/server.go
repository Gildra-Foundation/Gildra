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

func (s *Server) GetAPIIndex(context.Context, api.GetAPIIndexRequestObject) (api.GetAPIIndexResponseObject, error) {
	const apiOrigin = "https://api.gildra.net/world-of-warcraft/"
	editions := []api.APIIndexEdition{
		{Edition: api.Retail, Product: "wow", Base: apiOrigin + "retail/v1"},
		{Edition: api.Classic, Product: "wow_classic", Base: apiOrigin + "classic/v1"},
		{Edition: api.ClassicEra, Product: "wow_classic_era", Base: apiOrigin + "classic-era/v1"},
		{Edition: api.Hardcore, Product: "wow_classic_hardcore", Base: apiOrigin + "hardcore/v1"},
	}
	return api.GetAPIIndex200JSONResponse{
		Version:  api.V1,
		Rest:     apiOrigin + "retail/v1/",
		Graphql:  "https://api.gildra.net/graphql",
		Catalog:  apiOrigin + "retail/v1/game/entities",
		Library:  apiOrigin + "retail/v1/library/datasets",
		Editions: &editions,
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
		response = append(response, toAPIProduct(product))
	}
	return api.ListGameProducts200JSONResponse{Data: response}, nil
}

func toAPIProduct(product catalog.Product) api.GameProduct {
	var sourceStatus *api.GameProductSourceStatus
	if product.SourceStatus != nil {
		value := api.GameProductSourceStatus(*product.SourceStatus)
		sourceStatus = &value
	}
	freshness := product.Freshness
	if strings.TrimSpace(freshness) == "" {
		freshness = "unknown"
	}
	freshnessReason := product.FreshnessReason
	if strings.TrimSpace(freshnessReason) == "" {
		freshnessReason = "Источник ещё не проверялся"
	}
	return api.GameProduct{
		Id:                   product.ID,
		Slug:                 product.Slug,
		Name:                 product.Name,
		BuildNumber:          product.BuildNumber,
		BuildVersion:         product.BuildVersion,
		Source:               optionalString(product.Source),
		SourceBuildNumber:    product.SourceBuildNumber,
		SourceBuildVersion:   product.SourceBuildVersion,
		SourceStatus:         sourceStatus,
		SourceCheckedAt:      product.SourceCheckedAt,
		EntityCount:          product.EntityCount,
		PublishedEntityCount: product.PublishedCount,
		PublicRelease:        pointer(product.PublicRelease),
		Freshness:            api.GameProductFreshness(freshness),
		FreshnessReason:      freshnessReason,
	}
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func (s *Server) ListLibraryDatasets(ctx context.Context, request api.ListLibraryDatasetsRequestObject) (api.ListLibraryDatasetsResponseObject, error) {
	product := "wow"
	if request.Params.Product != nil {
		product = *request.Params.Product
	}
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	datasets, err := s.catalog.LibraryDatasets(ctx, product, locale)
	if err != nil {
		return api.ListLibraryDatasets500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "public library is temporarily unavailable",
		}}, nil
	}
	data := make([]api.LibraryDataset, 0, len(datasets))
	for _, dataset := range datasets {
		data = append(data, toAPILibraryDataset(dataset))
	}
	return api.ListLibraryDatasets200JSONResponse{Data: data}, nil
}

func (s *Server) ListGameCategories(ctx context.Context, request api.ListGameCategoriesRequestObject) (api.ListGameCategoriesResponseObject, error) {
	product := "wow"
	if request.Params.Product != nil {
		product = *request.Params.Product
	}
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	categories, err := s.catalog.Categories(ctx, product, request.Params.Type, locale)
	if err != nil {
		if strings.Contains(err.Error(), "required") {
			return api.ListGameCategories400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_category_query", Message: err.Error(),
			}}, nil
		}
		return api.ListGameCategories500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	response := make([]api.GameCategory, 0, len(categories))
	for _, category := range categories {
		item := api.GameCategory{
			Id: category.ID, Type: category.Type, Facet: category.Facet, Slug: category.Slug,
			Path: category.Path, Name: category.Name, Description: new(category.Description),
			Count: category.Count, SortOrder: category.SortOrder,
		}
		if category.ParentPath != "" {
			item.ParentPath = new(category.ParentPath)
		}
		response = append(response, item)
	}
	return api.ListGameCategories200JSONResponse{Data: response}, nil
}

func (s *Server) ListGameEntityTypes(ctx context.Context, request api.ListGameEntityTypesRequestObject) (api.ListGameEntityTypesResponseObject, error) {
	product := "wow"
	if request.Params.Product != nil {
		product = *request.Params.Product
	}
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	types, err := s.catalog.EntityTypes(ctx, product, locale)
	if err != nil {
		return api.ListGameEntityTypes500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameEntityTypeSummary, 0, len(types))
	for _, entityType := range types {
		data = append(data, api.GameEntityTypeSummary{
			Type: entityType.Type, Label: entityType.Label, Description: entityType.Description,
			Group: entityType.Group, IconSymbol: entityType.IconSymbol, SortOrder: entityType.SortOrder,
			Count: entityType.Count, LocalizedCount: entityType.LocalizedCount,
			DescribedCount: entityType.DescribedCount, TooltipCount: entityType.TooltipCount,
			IconCount: entityType.IconCount, RelationshipCount: entityType.RelationshipCount,
			CoverageUpdatedAt: entityType.CoverageUpdatedAt,
		})
	}
	return api.ListGameEntityTypes200JSONResponse{Data: data}, nil
}

func (s *Server) ListGameEntitySummaries(ctx context.Context, request api.ListGameEntitySummariesRequestObject) (api.ListGameEntitySummariesResponseObject, error) {
	params := catalog.SummaryParams{Product: "wow", Locale: "en_US", Limit: 20, IncludeTotal: true}
	if request.Params.Product != nil {
		params.Product = *request.Params.Product
	}
	if request.Params.Type != nil {
		params.Type = *request.Params.Type
	}
	if request.Params.Dataset != nil {
		params.Dataset = *request.Params.Dataset
	}
	if request.Params.Locale != nil {
		params.Locale = string(*request.Params.Locale)
	}
	if request.Params.Q != nil {
		params.Query = *request.Params.Q
	}
	if request.Params.Category != nil {
		params.Category = *request.Params.Category
	}
	if request.Params.Facet != nil {
		params.Facets = append([]string(nil), (*request.Params.Facet)...)
	}
	params.ItemClassID = request.Params.ItemClassId
	params.MinItemLevel = request.Params.MinItemLevel
	params.MaxItemLevel = request.Params.MaxItemLevel
	params.MinRequiredLevel = request.Params.MinRequiredLevel
	params.MaxRequiredLevel = request.Params.MaxRequiredLevel
	if request.Params.Cursor != nil {
		params.Cursor = *request.Params.Cursor
	}
	if request.Params.Limit != nil {
		params.Limit = *request.Params.Limit
	}
	if request.Params.IncludeTotal != nil {
		params.IncludeTotal = *request.Params.IncludeTotal
	}
	page, err := s.catalog.Summaries(ctx, params)
	if err != nil {
		if strings.Contains(err.Error(), "cursor") || strings.Contains(err.Error(), "limit") || strings.Contains(err.Error(), "ItemLevel") || strings.Contains(err.Error(), "item level") || strings.Contains(err.Error(), "RequiredLevel") || strings.Contains(err.Error(), "required level") || strings.Contains(err.Error(), "itemClassId") || strings.Contains(err.Error(), "dataset") || strings.Contains(err.Error(), "facet") {
			return api.ListGameEntitySummaries400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_page", Message: err.Error(),
			}}, nil
		}
		return api.ListGameEntitySummaries500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameEntitySummary, 0, len(page.Entities))
	for _, entity := range page.Entities {
		locale := api.GameEntitySummaryLocale(entity.Locale)
		highlights := make([]api.GameEntityHighlight, 0, len(entity.Highlights))
		for _, highlight := range entity.Highlights {
			highlights = append(highlights, api.GameEntityHighlight{Key: highlight.Key, Value: highlight.Value})
		}
		data = append(data, api.GameEntitySummary{
			Id: entity.ID, Product: &entity.Product, Type: entity.Type, ExternalId: entity.ExternalID,
			Slug: entity.Slug, Locale: &locale, LocaleFallback: &entity.LocaleFallback, Name: entity.Name,
			Description: &entity.Description, IconName: entity.IconName, IconUrl: entity.IconURL,
			Quality: entity.Quality, ItemLevel: entity.ItemLevel, BuildId: entity.BuildID,
			UpdatedAt: &entity.UpdatedAt, Highlights: &highlights,
		})
	}
	pagination := api.SummaryCursorPage{HasMore: page.HasMore, Total: page.Total}
	if page.NextCursor != "" {
		pagination.NextCursor = &page.NextCursor
	}
	return api.ListGameEntitySummaries200JSONResponse{Data: data, Pagination: pagination}, nil
}

func (s *Server) ListGameSitemapEntries(ctx context.Context, request api.ListGameSitemapEntriesRequestObject) (api.ListGameSitemapEntriesResponseObject, error) {
	product, shard := "wow", ""
	if request.Params.Product != nil {
		product = *request.Params.Product
	}
	if request.Params.Shard != nil {
		shard = *request.Params.Shard
	}
	entries, err := s.catalog.SitemapEntries(ctx, product, request.Params.Type, shard)
	if err != nil {
		if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "shard") {
			return api.ListGameSitemapEntries400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_sitemap_shard", Message: err.Error(),
			}}, nil
		}
		return api.ListGameSitemapEntries500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "catalog sitemap is temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameSitemapEntry, 0, len(entries))
	for _, entry := range entries {
		data = append(data, api.GameSitemapEntry{Id: entry.ID, Type: entry.Type, Slug: entry.Slug, UpdatedAt: entry.UpdatedAt})
	}
	return api.ListGameSitemapEntries200JSONResponse{Data: data}, nil
}

func (s *Server) ListGameCoverage(ctx context.Context, request api.ListGameCoverageRequestObject) (api.ListGameCoverageResponseObject, error) {
	product, locale, entityType := "wow", "en_US", ""
	if request.Params.Product != nil {
		product = *request.Params.Product
	}
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	if request.Params.Type != nil {
		entityType = *request.Params.Type
	}
	coverage, err := s.catalog.Coverage(ctx, product, locale, entityType)
	if err != nil {
		return api.ListGameCoverage500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "catalog coverage is temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameFieldCoverage, 0, len(coverage))
	for _, item := range coverage {
		data = append(data, api.GameFieldCoverage{
			Product: item.Product, BuildId: item.BuildID, Type: item.Type,
			Locale: api.GameFieldCoverageLocale(item.Locale), Field: item.Field, Source: item.Source,
			EntityCount: item.EntityCount, PopulatedCount: item.PopulatedCount,
			UnresolvedCount: item.UnresolvedCount, ConflictCount: item.ConflictCount,
			RefreshedAt: item.RefreshedAt,
		})
	}
	return api.ListGameCoverage200JSONResponse{Data: data}, nil
}

func (s *Server) ListGameSourcePolicies(ctx context.Context, _ api.ListGameSourcePoliciesRequestObject) (api.ListGameSourcePoliciesResponseObject, error) {
	policies, err := s.catalog.SourcePolicies(ctx)
	if err != nil {
		return api.ListGameSourcePolicies500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "catalog source policies are temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameSourcePolicy, 0, len(policies))
	for _, policy := range policies {
		data = append(data, api.GameSourcePolicy{
			Source: policy.Source, DisplayName: policy.DisplayName, HomepageUrl: policy.HomepageURL,
			TermsUrl: policy.TermsURL, LicenseIdentifier: policy.LicenseIdentifier,
			CommercialUseStatus: api.GameSourcePolicyCommercialUseStatus(policy.CommercialUseStatus),
			PublicApiStatus:     api.GameSourcePolicyPublicApiStatus(policy.PublicAPIStatus),
			AssetCachingStatus:  api.GameSourcePolicyAssetCachingStatus(policy.AssetCachingStatus),
			RetentionDays:       policy.RetentionDays, AttributionRequired: policy.AttributionRequired,
			AttributionText: policy.AttributionText, ReviewedAt: policy.ReviewedAt,
			ReviewStatus: api.GameSourcePolicyReviewStatus(policy.ReviewStatus), Notes: policy.Notes,
		})
	}
	return api.ListGameSourcePolicies200JSONResponse{Data: data}, nil
}

func (s *Server) ListGameRelationTypes(ctx context.Context, request api.ListGameRelationTypesRequestObject) (api.ListGameRelationTypesResponseObject, error) {
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	relations, err := s.catalog.RelationTypes(ctx, locale)
	if err != nil {
		return api.ListGameRelationTypes500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "catalog relation types are temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameRelationType, 0, len(relations))
	for _, relation := range relations {
		data = append(data, api.GameRelationType{
			Relation: relation.Relation, Label: relation.Label, Description: relation.Description,
			InverseRelation: relation.InverseRelation, AllowedSourceTypes: relation.AllowedSourceTypes,
			AllowedTargetTypes: relation.AllowedTargetTypes, AttributeSchema: relation.AttributeSchema,
			SchemaVersion: relation.SchemaVersion,
		})
	}
	return api.ListGameRelationTypes200JSONResponse{Data: data}, nil
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
	if request.Params.Category != nil {
		params.Category = *request.Params.Category
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
	pagination := api.CursorPage{HasMore: page.HasMore, Total: page.Total}
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
	if request.Params.Dataset != nil {
		contains, membershipErr := s.catalog.DatasetContainsEntity(ctx, *request.Params.Dataset, entity.ID)
		if membershipErr != nil {
			return api.GetGameEntity500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
				Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
			}}, nil
		}
		if !contains {
			return api.GetGameEntity404ApplicationProblemPlusJSONResponse{
				NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("The requested game entity is not part of this public dataset."),
			}, nil
		}
	}
	return api.GetGameEntity200JSONResponse(toAPIEntity(entity)), nil
}

func (s *Server) ListGameEntityRelationships(ctx context.Context, request api.ListGameEntityRelationshipsRequestObject) (api.ListGameEntityRelationshipsResponseObject, error) {
	params := catalog.RelationshipParams{EntityID: request.Id, Locale: "en_US", Direction: "both", Limit: 20}
	if request.Params.Locale != nil {
		params.Locale = string(*request.Params.Locale)
	}
	if request.Params.Direction != nil {
		params.Direction = string(*request.Params.Direction)
	}
	if request.Params.Relation != nil {
		params.Relation = *request.Params.Relation
	}
	if request.Params.Cursor != nil {
		params.Cursor = *request.Params.Cursor
	}
	if request.Params.Limit != nil {
		params.Limit = *request.Params.Limit
	}
	page, err := s.catalog.Relationships(ctx, params)
	if errors.Is(err, catalog.ErrNotFound) {
		return api.ListGameEntityRelationships404ApplicationProblemPlusJSONResponse{
			NotFoundApplicationProblemPlusJSONResponse: api.NotFoundApplicationProblemPlusJSONResponse{
				Type: "https://api.gildra.net/errors/not-found", Title: "Not Found", Status: 404,
				Detail: new("The requested game entity does not exist."),
			},
		}, nil
	}
	if err != nil {
		if strings.Contains(err.Error(), "cursor") || strings.Contains(err.Error(), "limit") || strings.Contains(err.Error(), "direction") {
			return api.ListGameEntityRelationships400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{
				Code: "invalid_relationship_query", Message: err.Error(),
			}}, nil
		}
		return api.ListGameEntityRelationships500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{
			Code: "catalog_unavailable", Message: "game catalog is temporarily unavailable",
		}}, nil
	}
	data := make([]api.GameEntityRelationship, 0, len(page.Relationships))
	for _, relationship := range page.Relationships {
		entity := api.GameEntitySummary{
			Id: relationship.Entity.ID, Type: relationship.Entity.Type, ExternalId: relationship.Entity.ExternalID,
			Slug: relationship.Entity.Slug, Name: relationship.Entity.Name, IconName: relationship.Entity.IconName,
			IconUrl: relationship.Entity.IconURL,
		}
		data = append(data, api.GameEntityRelationship{
			Direction: api.GameEntityRelationshipDirection(relationship.Direction), Relation: relationship.Relation,
			BuildId: relationship.BuildID, Attributes: relationship.Attributes, Entity: entity,
		})
	}
	pagination := api.CursorPage{HasMore: page.HasMore, Total: page.Total}
	if page.NextCursor != "" {
		pagination.NextCursor = &page.NextCursor
	}
	return api.ListGameEntityRelationships200JSONResponse{Data: data, Pagination: pagination}, nil
}

func (s *Server) GetGameEntityQuality(ctx context.Context, request api.GetGameEntityQualityRequestObject) (api.GetGameEntityQualityResponseObject, error) {
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	report, err := s.catalog.Quality(ctx, request.Id, locale)
	if errors.Is(err, catalog.ErrNotFound) {
		return api.GetGameEntityQuality404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("The requested game entity does not exist.")}, nil
	}
	if err != nil {
		return api.GetGameEntityQuality500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{Code: "catalog_unavailable", Message: "entity quality is temporarily unavailable"}}, nil
	}
	checks := make([]api.GameEntityQualityCheck, 0, len(report.Checks))
	for _, check := range report.Checks {
		item := api.GameEntityQualityCheck{Key: check.Key, Label: check.Label, Present: check.Present, Required: check.Required}
		if check.Detail != "" {
			item.Detail = &check.Detail
		}
		checks = append(checks, item)
	}
	sources := make([]api.GameEntitySource, 0, len(report.Sources))
	for _, source := range report.Sources {
		item := api.GameEntitySource{Source: source.Source, DisplayName: source.DisplayName, Documents: source.Documents, ImportedAt: source.ImportedAt}
		if source.SourceURL != "" {
			item.SourceUrl = &source.SourceURL
		}
		sources = append(sources, item)
	}
	return api.GetGameEntityQuality200JSONResponse{EntityId: report.EntityID, Score: report.Score, Status: api.GameEntityQualityStatus(report.Status), BuildId: report.BuildID, BuildNumber: report.BuildNumber, BuildVersion: report.BuildVersion, UpdatedAt: report.UpdatedAt, Checks: checks, Confirmed: report.Confirmed, Missing: report.Missing, Sources: sources}, nil
}

func (s *Server) ListGameEntityVersions(ctx context.Context, request api.ListGameEntityVersionsRequestObject) (api.ListGameEntityVersionsResponseObject, error) {
	locale, limit := "en_US", 20
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	versions, err := s.catalog.Versions(ctx, request.Id, locale, limit)
	if errors.Is(err, catalog.ErrNotFound) {
		return api.ListGameEntityVersions404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("The requested game entity does not exist.")}, nil
	}
	if err != nil {
		if strings.Contains(err.Error(), "limit") {
			return api.ListGameEntityVersions400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Code: "invalid_page", Message: err.Error()}}, nil
		}
		return api.ListGameEntityVersions500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{Code: "catalog_unavailable", Message: "version history is temporarily unavailable"}}, nil
	}
	data := make([]api.GameEntityVersion, 0, len(versions))
	for _, version := range versions {
		data = append(data, toAPIVersion(version))
	}
	return api.ListGameEntityVersions200JSONResponse{Data: data}, nil
}

func (s *Server) GetGameEntityComparison(ctx context.Context, request api.GetGameEntityComparisonRequestObject) (api.GetGameEntityComparisonResponseObject, error) {
	locale := "en_US"
	if request.Params.Locale != nil {
		locale = string(*request.Params.Locale)
	}
	comparison, err := s.catalog.Compare(ctx, request.Id, locale, request.Params.FromBuildId, request.Params.ToBuildId)
	if errors.Is(err, catalog.ErrNotFound) {
		return api.GetGameEntityComparison404ApplicationProblemPlusJSONResponse{NotFoundApplicationProblemPlusJSONResponse: notFoundProblem("Two matching entity versions were not found.")}, nil
	}
	if err != nil {
		if strings.Contains(err.Error(), "provided together") || strings.Contains(err.Error(), "must differ") {
			return api.GetGameEntityComparison400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Code: "invalid_comparison", Message: err.Error()}}, nil
		}
		return api.GetGameEntityComparison500JSONResponse{InternalErrorJSONResponse: api.InternalErrorJSONResponse{Code: "catalog_unavailable", Message: "version comparison is temporarily unavailable"}}, nil
	}
	changes := make([]api.GameEntityChange, 0, len(comparison.Changes))
	for _, change := range comparison.Changes {
		changes = append(changes, api.GameEntityChange{Field: change.Field, Label: change.Label, Before: change.Before, After: change.After, ChangeType: api.GameEntityChangeChangeType(change.ChangeType)})
	}
	return api.GetGameEntityComparison200JSONResponse{From: toAPIVersion(comparison.From), To: toAPIVersion(comparison.To), Changes: changes}, nil
}

func toAPIVersion(version catalog.EntityVersion) api.GameEntityVersion {
	return api.GameEntityVersion{Id: version.ID, BuildId: version.BuildID, BuildNumber: version.BuildNumber, BuildVersion: version.BuildVersion, Revision: version.Revision, Name: version.Name, Description: version.Description, SourceUrl: version.SourceURL, ObservedAt: version.ObservedAt}
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
	// Keep localized source values and the raw payload in the full entity
	// response so API consumers can render complete records without guessing.
	result := api.GameEntity{
		Id: entity.ID, Product: entity.Product, Type: entity.Type,
		ExternalId: entity.ExternalID, Slug: entity.Slug,
		Locale: api.GameEntityLocale(entity.Locale), Name: entity.Name,
		ResolvedLocale: api.GameEntityResolvedLocale(entity.ResolvedLocale),
		LocaleFallback: entity.LocaleFallback,
		Description:    entity.Description, RawDescription: entity.RawDescription,
		ResolvedDescription: entity.ResolvedDescription, DescriptionState: entity.DescriptionState, BuildId: entity.BuildID,
		Localizations: make(map[string]api.GameEntityLocalization, len(entity.Localizations)),
		Payload:       entity.Payload,
		UpdatedAt:     entity.UpdatedAt,
	}
	for locale, localization := range entity.Localizations {
		result.Localizations[locale] = api.GameEntityLocalization{
			Name: localization.Name, Description: localization.Description,
			ResolvedDescription: localization.ResolvedDescription, DescriptionState: localization.DescriptionState,
		}
	}
	if entity.Tooltip != nil {
		result.Tooltip = &api.GameTooltip{PlainText: entity.Tooltip.PlainText, Blocks: entity.Tooltip.Blocks}
	}
	if len(entity.Media) > 0 {
		media := make([]api.GameEntityMedia, 0, len(entity.Media))
		for _, asset := range entity.Media {
			media = append(media, api.GameEntityMedia{
				Kind: asset.Kind, AssetKey: asset.AssetKey, Url: asset.URL,
				Source: asset.Source, SourceUrl: asset.SourceURL, Locale: asset.Locale,
				MimeType: asset.MIMEType, CacheStatus: api.GameEntityMediaCacheStatus(asset.CacheStatus),
				FileDataId: asset.FileDataID, Width: asset.Width, Height: asset.Height, Primary: asset.Primary,
			})
		}
		result.Media = &media
	}
	result.IconName = entity.IconName
	result.IconUrl = entity.IconURL
	result.Quality = entity.Quality
	return result
}

func toAPILibraryDataset(dataset catalog.LibraryDataset) api.LibraryDataset {
	return api.LibraryDataset{
		Slug: dataset.Slug, Product: dataset.Product, EntityType: dataset.EntityType,
		CategoryPath: dataset.CategoryPath, ItemClassId: dataset.ItemClassID, Group: dataset.Group, IconSymbol: dataset.IconSymbol,
		SortOrder: dataset.SortOrder, Name: dataset.Name, Description: dataset.Description,
		BuildVersion: dataset.BuildVersion, PreviewImageUrl: dataset.PreviewImageURL, EntityCount: dataset.EntityCount,
		LocalizedCount: dataset.LocalizedCount, VerifiedLocalizedCount: dataset.VerifiedLocalizedCount,
		TooltipCount:  dataset.TooltipCount,
		ImageCount:    dataset.ImageCount,
		Applicability: api.LibraryDatasetApplicability(dataset.Applicability), ApplicabilityReason: dataset.ApplicabilityReason,
		Freshness:       api.LibraryDatasetFreshness(dataset.Freshness),
		FreshnessReason: dataset.FreshnessReason, CoverageUpdatedAt: dataset.CoverageUpdatedAt,
	}
}

//go:fix inline
func pointer[T any](value T) *T { return new(value) }
