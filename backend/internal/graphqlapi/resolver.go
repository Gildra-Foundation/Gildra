package graphqlapi

import (
	"strconv"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/graphqlapi/model"
)

//go:generate go tool gqlgen generate

type Resolver struct {
	Catalog *catalog.Service
}

func localeValue(locale *model.Locale) string {
	if locale != nil && *locale == model.LocaleRuRu {
		return "ru_RU"
	}
	return "en_US"
}

func toGraphQLProduct(product catalog.Product) *model.GameProduct {
	var buildNumber *int
	if product.BuildNumber != nil {
		value := int(*product.BuildNumber)
		buildNumber = &value
	}
	var sourceBuildNumber *int
	if product.SourceBuildNumber != nil {
		value := int(*product.SourceBuildNumber)
		sourceBuildNumber = &value
	}
	freshness := product.Freshness
	if strings.TrimSpace(freshness) == "" {
		freshness = "unknown"
	}
	freshnessReason := product.FreshnessReason
	if strings.TrimSpace(freshnessReason) == "" {
		freshnessReason = "Источник ещё не проверялся"
	}
	return &model.GameProduct{
		ID: int(product.ID), Slug: product.Slug, Name: product.Name,
		BuildNumber: buildNumber, BuildVersion: product.BuildVersion,
		Source: product.Source, SourceBuildNumber: sourceBuildNumber,
		SourceBuildVersion: product.SourceBuildVersion, SourceStatus: product.SourceStatus,
		SourceCheckedAt: product.SourceCheckedAt,
		EntityCount:     int(product.EntityCount), PublishedEntityCount: int(product.PublishedCount),
		PublicRelease: product.PublicRelease, Freshness: freshness, FreshnessReason: freshnessReason,
	}
}

func toGraphQLEntity(entity catalog.Entity) *model.GameEntity {
	result := &model.GameEntity{
		ID: entity.ID.String(), Product: entity.Product, Type: entity.Type,
		ExternalID: strconv.FormatInt(entity.ExternalID, 10), Slug: entity.Slug,
		Locale: model.Locale(entity.Locale), ResolvedLocale: model.Locale(entity.ResolvedLocale),
		LocaleFallback: entity.LocaleFallback, Name: entity.Name, Description: entity.Description,
		RawDescription: entity.RawDescription, ResolvedDescription: entity.ResolvedDescription, DescriptionState: entity.DescriptionState,
		Localizations: make([]*model.GameEntityLocalization, 0, len(entity.Localizations)),
		Media:         make([]*model.GameEntityMedia, 0, len(entity.Media)),
		IconName:      entity.IconName, IconURL: entity.IconURL, Quality: entity.Quality,
		Payload: entity.Payload, UpdatedAt: entity.UpdatedAt,
	}
	for _, locale := range []string{"en_US", "ru_RU"} {
		localization, ok := entity.Localizations[locale]
		if !ok {
			continue
		}
		result.Localizations = append(result.Localizations, &model.GameEntityLocalization{
			Locale: model.Locale(locale), Name: localization.Name, Description: localization.Description,
			ResolvedDescription: localization.ResolvedDescription, DescriptionState: localization.DescriptionState,
		})
	}
	if entity.Tooltip != nil {
		result.Tooltip = &model.GameTooltip{PlainText: entity.Tooltip.PlainText, Blocks: entity.Tooltip.Blocks}
	}
	for _, asset := range entity.Media {
		media := &model.GameEntityMedia{
			Kind: asset.Kind, AssetKey: asset.AssetKey, URL: asset.URL,
			Source: asset.Source, SourceURL: asset.SourceURL, Locale: asset.Locale,
			MimeType: asset.MIMEType, CacheStatus: asset.CacheStatus, Primary: asset.Primary,
			Width: asset.Width, Height: asset.Height,
		}
		if asset.FileDataID != nil {
			value := strconv.FormatInt(*asset.FileDataID, 10)
			media.FileDataID = &value
		}
		result.Media = append(result.Media, media)
	}
	if entity.BuildID != nil {
		buildID := strconv.FormatInt(*entity.BuildID, 10)
		result.BuildID = &buildID
	}
	return result
}

func toGraphQLDataset(dataset catalog.LibraryDataset) *model.LibraryDataset {
	result := &model.LibraryDataset{
		Slug: dataset.Slug, Product: dataset.Product, EntityType: dataset.EntityType,
		CategoryPath: dataset.CategoryPath, ItemClassID: dataset.ItemClassID,
		Group: dataset.Group, IconSymbol: dataset.IconSymbol, SortOrder: dataset.SortOrder, Name: dataset.Name,
		Description: dataset.Description, EntityCount: int(dataset.EntityCount),
		LocalizedCount: int(dataset.LocalizedCount), VerifiedLocalizedCount: int(dataset.VerifiedLocalizedCount),
		TooltipCount: int(dataset.TooltipCount), ImageCount: int(dataset.ImageCount),
		Applicability: dataset.Applicability, ApplicabilityReason: dataset.ApplicabilityReason,
		Freshness: dataset.Freshness, FreshnessReason: dataset.FreshnessReason,
		CoverageUpdatedAt: dataset.CoverageUpdatedAt,
	}
	result.BuildVersion = dataset.BuildVersion
	result.PreviewIconName = dataset.PreviewIconName
	result.PreviewImageURL = dataset.PreviewImageURL
	return result
}

func toGraphQLRelationship(relationship catalog.Relationship) *model.GameEntityRelationship {
	return &model.GameEntityRelationship{
		Direction:  model.RelationshipDirection(relationship.Direction),
		Relation:   relationship.Relation,
		BuildID:    strconv.FormatInt(relationship.BuildID, 10),
		Attributes: relationship.Attributes,
		Entity: &model.GameEntitySummary{
			ID: relationship.Entity.ID.String(), Product: relationship.Entity.Product,
			Type: relationship.Entity.Type, ExternalID: strconv.FormatInt(relationship.Entity.ExternalID, 10),
			Slug: relationship.Entity.Slug, Name: relationship.Entity.Name,
			IconName: relationship.Entity.IconName, IconURL: relationship.Entity.IconURL,
		},
	}
}
