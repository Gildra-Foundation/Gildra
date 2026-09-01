package graphqlapi

import (
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/graphqlapi/model"
	"github.com/google/uuid"
)

func TestToGraphQLEntityExposesFullCatalogContract(t *testing.T) {
	iconURL := "https://api.gildra.net/v1/media/79be8de3-77ba-436d-afd0-91a38146611a"
	quality := 95
	fileDataID := int64(12345)
	entity := catalog.Entity{
		ID: uuid.New(), Product: "wow", Type: "spell", ExternalID: 133, Slug: "fireball",
		Locale: "ru_RU", ResolvedLocale: "ru_RU", Name: "Огненный шар", Description: "Бросает огненный шар.",
		RawDescription: "Бросает $s1 ед. урона.", ResolvedDescription: "Бросает 100 ед. урона.",
		DescriptionState: "present",
		Localizations: map[string]catalog.EntityLocalization{
			"en_US": {Name: "Fireball", Description: "Hurls a fiery ball.", ResolvedDescription: "Hurls a fiery ball.", DescriptionState: "present"},
			"ru_RU": {Name: "Огненный шар", Description: "Бросает $s1 ед. урона.", ResolvedDescription: "Бросает 100 ед. урона.", DescriptionState: "unresolved"},
		},
		Tooltip: &catalog.Tooltip{PlainText: "Hurls a fiery ball.", Blocks: []map[string]any{{"type": "spell_effects"}}},
		Media:   []catalog.Media{{Kind: "icon", AssetKey: "icon", URL: iconURL, Source: "blizzard_api", SourceURL: "https://render.worldofwarcraft.com/icon.jpg", Locale: "en_US", MIMEType: "image/jpeg", CacheStatus: "cached", FileDataID: &fileDataID, Primary: true}},
		IconURL: &iconURL, Quality: &quality, Payload: map[string]any{"spell_id": int64(133)}, UpdatedAt: time.Unix(1, 0).UTC(),
	}
	got := toGraphQLEntity(entity)
	if len(got.Localizations) != 2 || got.Localizations[0].Name != "Fireball" || got.Localizations[1].Name != "Огненный шар" {
		t.Fatalf("graphql localizations = %#v", got.Localizations)
	}
	if got.Tooltip == nil || got.Media == nil || len(got.Media) != 1 || got.IconURL == nil || got.Quality == nil || *got.Quality != quality {
		t.Fatalf("graphql detail fields were lost: %#v", got)
	}
	if got.Media[0].FileDataID == nil || *got.Media[0].FileDataID != "12345" {
		t.Fatalf("graphql FileDataID = %#v", got.Media[0].FileDataID)
	}
	if got.RawDescription != entity.RawDescription || got.ResolvedDescription != entity.ResolvedDescription || got.Localizations[1].ResolvedDescription != "Бросает 100 ед. урона." {
		t.Fatalf("graphql raw/resolved descriptions = %#v", got)
	}
	if got.DescriptionState != "present" || got.Localizations[1].DescriptionState != "unresolved" {
		t.Fatalf("graphql description states = %#v", got)
	}
}

func TestToGraphQLProductExposesEditionBuildAndPublication(t *testing.T) {
	buildNumber := int32(69497)
	buildVersion := "12.1.0.69497"
	sourceBuildNumber := int32(69497)
	sourceBuildVersion := "12.1.0.69497"
	sourceStatus := "current"
	got := toGraphQLProduct(catalog.Product{
		ID: 1, Slug: "wow", Name: "World of Warcraft",
		BuildNumber: &buildNumber, BuildVersion: &buildVersion,
		Source: "wago_tools", SourceBuildNumber: &sourceBuildNumber, SourceBuildVersion: &sourceBuildVersion,
		SourceStatus: &sourceStatus, Freshness: "fresh", FreshnessReason: "build matches",
		EntityCount: 825913, PublishedCount: 743967, PublicRelease: true,
	})
	if got.BuildNumber == nil || *got.BuildNumber != 69497 || got.BuildVersion == nil || *got.BuildVersion != buildVersion {
		t.Fatalf("graphql product build metadata = %#v", got)
	}
	if got.EntityCount != 825913 || got.PublishedEntityCount != 743967 || !got.PublicRelease {
		t.Fatalf("graphql product publication metadata = %#v", got)
	}
	if got.Source != "wago_tools" || got.SourceBuildNumber == nil || *got.SourceBuildNumber != int(sourceBuildNumber) ||
		got.SourceBuildVersion == nil || *got.SourceBuildVersion != sourceBuildVersion || got.SourceStatus == nil ||
		*got.SourceStatus != sourceStatus || got.Freshness != "fresh" || got.FreshnessReason != "build matches" {
		t.Fatalf("graphql product freshness metadata = %#v", got)
	}
}

func TestToGraphQLRelationshipPreservesTargetIdentityAndMedia(t *testing.T) {
	iconName := "inv_sword_07"
	iconURL := "https://api.gildra.net/v1/media/icon"
	entityID := uuid.New()
	got := toGraphQLRelationship(catalog.Relationship{
		Direction: "outgoing", Relation: "drops", BuildID: 69497,
		Attributes: map[string]any{"chance_percent": 12.5},
		Entity: catalog.EntitySummary{
			ID: entityID, Product: "wow", Type: "item", ExternalID: 19019,
			Slug: "thunderfury", Name: "Thunderfury", IconName: &iconName, IconURL: &iconURL,
		},
	})
	if got.Direction != model.RelationshipDirectionOutgoing || got.Relation != "drops" || got.BuildID != "69497" {
		t.Fatalf("graphql relationship identity = %#v", got)
	}
	if got.Entity == nil || got.Entity.ID != entityID.String() || got.Entity.Product != "wow" || got.Entity.ExternalID != "19019" {
		t.Fatalf("graphql relationship target = %#v", got.Entity)
	}
	if got.Entity.IconName == nil || *got.Entity.IconName != iconName || got.Entity.IconURL == nil || *got.Entity.IconURL != iconURL {
		t.Fatalf("graphql relationship media = %#v", got.Entity)
	}
}

func TestToGraphQLDatasetExposesFreshnessAndCoverage(t *testing.T) {
	build := "12.1.0.69497"
	preview := "https://api.gildra.net/v1/media/preview"
	itemClassID := 2
	dataset := catalog.LibraryDataset{
		Slug: "items", Product: "wow", EntityType: "item", CategoryPath: "equipment", ItemClassID: &itemClassID,
		Group: "equipment", IconSymbol: "#ic-item", SortOrder: 10,
		Name: "Items", Description: "All items", BuildVersion: &build, PreviewImageURL: &preview,
		EntityCount: 100, LocalizedCount: 95, VerifiedLocalizedCount: 90, TooltipCount: 80, ImageCount: 75,
		Applicability: "applicable", Freshness: "fresh", FreshnessReason: "published data and coverage are current",
	}
	got := toGraphQLDataset(dataset)
	if got.Slug != dataset.Slug || got.EntityCount != 100 || got.Freshness != "fresh" || got.BuildVersion == nil || *got.BuildVersion != build {
		t.Fatalf("graphql dataset mapping lost coverage fields: %#v", got)
	}
	if got.CategoryPath != dataset.CategoryPath || got.ItemClassID == nil || *got.ItemClassID != 2 || got.SortOrder != dataset.SortOrder {
		t.Fatalf("graphql dataset taxonomy fields = %#v", got)
	}
	if got.PreviewImageURL == nil || *got.PreviewImageURL != preview {
		t.Fatalf("graphql dataset mapping lost preview image: %#v", got)
	}
}

func TestToGraphQLGovernanceMappingsPreserveCoverageAndSources(t *testing.T) {
	updated := time.Unix(2, 0).UTC()
	entityType := toGraphQLEntityType(catalog.EntityTypeSummary{
		Type: "item", Label: "Items", Description: "Equipment", Group: "equipment", IconSymbol: "#item",
		SortOrder: 3, Count: 10, LocalizedCount: 9, DescribedCount: 8, TooltipCount: 7, IconCount: 6,
		RelationshipCount: 5, CoverageUpdatedAt: updated,
	})
	if entityType.Type != "item" || entityType.Count != 10 || entityType.TooltipCount != 7 || !entityType.CoverageUpdatedAt.Equal(updated) {
		t.Fatalf("graphql entity type mapping = %#v", entityType)
	}

	before := map[string]any{"value": "old"}
	comparison := toGraphQLComparison(catalog.EntityComparison{
		From:    catalog.EntityVersion{ID: uuid.New(), BuildID: 1, BuildNumber: 1, BuildVersion: "1", ObservedAt: updated, Payload: map[string]any{}},
		To:      catalog.EntityVersion{ID: uuid.New(), BuildID: 2, BuildNumber: 2, BuildVersion: "2", ObservedAt: updated, Payload: map[string]any{}},
		Changes: []catalog.EntityChange{{Field: "name", Label: "Name", ChangeType: "changed", Before: before, After: "new"}},
	})
	if comparison == nil || len(comparison.Changes) != 1 || comparison.Changes[0].Before["value"] != "old" || comparison.Changes[0].After["value"] != "new" {
		t.Fatalf("graphql comparison mapping = %#v", comparison)
	}

	policy := toGraphQLSourcePolicy(catalog.SourcePolicy{Source: "wago_tools", DisplayName: "Wago", HomepageURL: "https://wago.tools", TermsURL: "https://wago.tools/terms", LicenseIdentifier: "custom", CommercialUseStatus: "allowed", PublicAPIStatus: "allowed", AssetCachingStatus: "permission_required", AttributionRequired: true, AttributionText: "Wago", ReviewedAt: &updated, ReviewStatus: "reviewed"})
	if policy.Source != "wago_tools" || !policy.AttributionRequired || policy.ReviewedAt == nil || !policy.ReviewedAt.Equal(updated) {
		t.Fatalf("graphql source policy mapping = %#v", policy)
	}
}
