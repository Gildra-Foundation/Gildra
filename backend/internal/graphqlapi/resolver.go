package graphqlapi

import (
	"strconv"

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

func toGraphQLEntity(entity catalog.Entity) *model.GameEntity {
	result := &model.GameEntity{
		ID: entity.ID.String(), Product: entity.Product, Type: entity.Type,
		ExternalID: strconv.FormatInt(entity.ExternalID, 10), Slug: entity.Slug,
		Locale: model.Locale(entity.Locale), ResolvedLocale: model.Locale(entity.ResolvedLocale),
		LocaleFallback: entity.LocaleFallback, Name: entity.Name, Description: entity.Description,
		RawDescription: entity.RawDescription, ResolvedDescription: entity.ResolvedDescription,
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
			ResolvedDescription: localization.ResolvedDescription,
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

func toGraphQLProduct(product catalog.Product) *model.GameProduct {
	return &model.GameProduct{
		ID: int(product.ID), Slug: product.Slug, Name: product.Name,
		Freshness: product.Freshness, FreshnessReason: product.FreshnessReason,
	}
}

func toGraphQLDataset(dataset catalog.LibraryDataset) *model.LibraryDataset {
	result := &model.LibraryDataset{
		Slug: dataset.Slug, Product: dataset.Product, EntityType: dataset.EntityType,
		Group: dataset.Group, IconSymbol: dataset.IconSymbol, Name: dataset.Name,
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
