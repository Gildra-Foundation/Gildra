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

func toGraphQLEntityType(entityType catalog.EntityTypeSummary) *model.GameEntityType {
	return &model.GameEntityType{
		Type: entityType.Type, Label: entityType.Label, Description: entityType.Description,
		Group: entityType.Group, IconSymbol: entityType.IconSymbol, SortOrder: entityType.SortOrder,
		Count: int(entityType.Count), LocalizedCount: int(entityType.LocalizedCount),
		DescribedCount: int(entityType.DescribedCount), TooltipCount: int(entityType.TooltipCount),
		IconCount: int(entityType.IconCount), RelationshipCount: int(entityType.RelationshipCount),
		CoverageUpdatedAt: entityType.CoverageUpdatedAt,
	}
}

func toGraphQLCategory(category catalog.Category) *model.GameCategory {
	return &model.GameCategory{
		ID: strconv.FormatInt(category.ID, 10), Type: category.Type, Facet: category.Facet,
		Slug: category.Slug, Path: category.Path, ParentPath: category.ParentPath,
		Name: category.Name, Description: category.Description, Count: int(category.Count), SortOrder: category.SortOrder,
	}
}

func toGraphQLCard(card catalog.CardSummary) *model.GameEntityCard {
	result := &model.GameEntityCard{
		ID: card.ID.String(), Product: card.Product, Type: card.Type,
		ExternalID: strconv.FormatInt(card.ExternalID, 10), Slug: card.Slug,
		Locale: model.Locale(card.Locale), LocaleFallback: card.LocaleFallback, Name: card.Name,
		Description: card.Description, IconName: card.IconName, IconURL: card.IconURL,
		Quality: card.Quality, ItemLevel: card.ItemLevel, UpdatedAt: card.UpdatedAt,
		Highlights: make([]*model.GameHighlight, 0, len(card.Highlights)), SearchRank: card.SearchRank,
	}
	if card.BuildID != nil {
		buildID := strconv.FormatInt(*card.BuildID, 10)
		result.BuildID = &buildID
	}
	for _, highlight := range card.Highlights {
		result.Highlights = append(result.Highlights, &model.GameHighlight{Key: highlight.Key, Value: highlight.Value})
	}
	return result
}

func toGraphQLQuality(report catalog.EntityQuality) *model.GameEntityQuality {
	result := &model.GameEntityQuality{
		EntityID: report.EntityID.String(), Score: report.Score, Status: report.Status,
		BuildID: strconv.FormatInt(report.BuildID, 10), BuildNumber: report.BuildNumber,
		BuildVersion: report.BuildVersion, UpdatedAt: report.UpdatedAt,
		Checks: make([]*model.GameQualityCheck, 0, len(report.Checks)), Confirmed: report.Confirmed,
		Missing: report.Missing, Sources: make([]*model.GameEntitySource, 0, len(report.Sources)),
	}
	for _, check := range report.Checks {
		result.Checks = append(result.Checks, &model.GameQualityCheck{Key: check.Key, Label: check.Label, Detail: check.Detail, Present: check.Present, Required: check.Required})
	}
	for _, source := range report.Sources {
		result.Sources = append(result.Sources, &model.GameEntitySource{Source: source.Source, DisplayName: source.DisplayName, Documents: source.Documents, SourceURL: source.SourceURL, ImportedAt: source.ImportedAt})
	}
	return result
}

func toGraphQLVersion(version catalog.EntityVersion) *model.GameEntityVersion {
	return &model.GameEntityVersion{
		ID: version.ID.String(), BuildID: strconv.FormatInt(version.BuildID, 10), BuildNumber: version.BuildNumber,
		Revision: version.Revision, BuildVersion: version.BuildVersion, Name: version.Name,
		Description: version.Description, SourceURL: version.SourceURL, ObservedAt: version.ObservedAt,
		Payload: version.Payload,
	}
}

func toGraphQLCoverage(coverage catalog.FieldCoverage) *model.GameFieldCoverage {
	return &model.GameFieldCoverage{
		Product: coverage.Product, BuildID: strconv.FormatInt(coverage.BuildID, 10), Type: coverage.Type,
		Locale: model.Locale(coverage.Locale), Field: coverage.Field, Source: coverage.Source,
		EntityCount: int(coverage.EntityCount), PopulatedCount: int(coverage.PopulatedCount),
		UnresolvedCount: int(coverage.UnresolvedCount), ConflictCount: int(coverage.ConflictCount),
		RefreshedAt: coverage.RefreshedAt,
	}
}

func toGraphQLSourcePolicy(policy catalog.SourcePolicy) *model.GameSourcePolicy {
	return &model.GameSourcePolicy{
		Source: policy.Source, DisplayName: policy.DisplayName, HomepageURL: policy.HomepageURL,
		TermsURL: policy.TermsURL, LicenseIdentifier: policy.LicenseIdentifier,
		CommercialUseStatus: policy.CommercialUseStatus, PublicAPIStatus: policy.PublicAPIStatus,
		AssetCachingStatus: policy.AssetCachingStatus, RetentionDays: policy.RetentionDays,
		AttributionRequired: policy.AttributionRequired, AttributionText: policy.AttributionText,
		ReviewedAt: policy.ReviewedAt, ReviewStatus: policy.ReviewStatus, Notes: policy.Notes,
	}
}

func toGraphQLRelationType(relation catalog.RelationType) *model.GameRelationType {
	return &model.GameRelationType{
		Relation: relation.Relation, Label: relation.Label, Description: relation.Description,
		InverseRelation: relation.InverseRelation, AllowedSourceTypes: relation.AllowedSourceTypes,
		AllowedTargetTypes: relation.AllowedTargetTypes, AttributeSchema: relation.AttributeSchema,
		SchemaVersion: relation.SchemaVersion,
	}
}

func toGraphQLComparison(comparison catalog.EntityComparison) *model.GameEntityComparison {
	result := &model.GameEntityComparison{From: toGraphQLVersion(comparison.From), To: toGraphQLVersion(comparison.To), Changes: make([]*model.GameEntityChange, 0, len(comparison.Changes))}
	for _, change := range comparison.Changes {
		result.Changes = append(result.Changes, &model.GameEntityChange{Field: change.Field, Label: change.Label, ChangeType: change.ChangeType, Before: jsonObject(change.Before), After: jsonObject(change.After)})
	}
	return result
}

// gqlgen's JSON scalar is intentionally object-shaped in the public schema.
// Comparison values can also be strings, numbers, or arrays; wrap those values
// instead of silently dropping them or making the whole comparison fail.
func jsonObject(value any) map[string]any {
	if value == nil {
		return nil
	}
	if object, ok := value.(map[string]any); ok {
		return object
	}
	return map[string]any{"value": value}
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
