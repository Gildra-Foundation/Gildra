package httpapi

import (
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
)

func TestAPIEntityExposesRequestedAndResolvedLocales(t *testing.T) {
	entity := catalog.Entity{
		ID: uuid.New(), Product: "wow", Type: "item", ExternalID: 25, Slug: "worn-shortsword",
		Locale: "ru_RU", ResolvedLocale: "en_US", LocaleFallback: true,
		Name: "Worn Shortsword", UpdatedAt: time.Unix(1, 0).UTC(),
	}
	got := toAPIEntity(entity)
	if got.Locale != "ru_RU" || got.ResolvedLocale != "en_US" || !got.LocaleFallback {
		t.Fatalf("locale provenance was lost in API mapping: %#v", got)
	}
}

func TestAPIEntityExposesBothSourceLocalizationsAndPayload(t *testing.T) {
	entity := catalog.Entity{
		ID: uuid.New(), Product: "wow", Type: "spell", ExternalID: 133, Slug: "fireball",
		Locale: "ru_RU", ResolvedLocale: "ru_RU", Name: "Огненный шар", Description: "Описание",
		RawDescription: "Бросает $s1 ед. урона.", ResolvedDescription: "Бросает 100 ед. урона.",
		Localizations: map[string]catalog.EntityLocalization{
			"en_US": {Name: "Fireball", Description: "Hurls a fiery ball.", ResolvedDescription: "Hurls a fiery ball."},
			"ru_RU": {Name: "Огненный шар", Description: "Бросает $s1 ед. урона.", ResolvedDescription: "Бросает 100 ед. урона."},
		},
		Payload:   map[string]any{"spell_id": int64(133), "cast_time_ms": int64(1500)},
		UpdatedAt: time.Unix(1, 0).UTC(),
	}
	got := toAPIEntity(entity)
	if len(got.Localizations) != 2 || got.Localizations["en_US"].Name != "Fireball" || got.Localizations["ru_RU"].Description == "" {
		t.Fatalf("source localizations were lost in API mapping: %#v", got.Localizations)
	}
	if got.Payload["spell_id"] != int64(133) {
		t.Fatalf("raw payload was lost in API mapping: %#v", got.Payload)
	}
	if got.RawDescription != entity.RawDescription || got.ResolvedDescription != entity.ResolvedDescription || got.Localizations["ru_RU"].ResolvedDescription != "Бросает 100 ед. урона." {
		t.Fatalf("raw/resolved descriptions were lost in API mapping: %#v", got)
	}
}

func TestAPIEntityExposesLocallyCachedSourceBackedMedia(t *testing.T) {
	localURL := "https://api.gildra.net/v1/media/" + uuid.NewString()
	entity := catalog.Entity{
		ID: uuid.New(), Product: "wow", Type: "achievement", ExternalID: 6, Slug: "level-10",
		Locale: "en_US", ResolvedLocale: "en_US", Name: "Level 10", UpdatedAt: time.Unix(1, 0).UTC(),
		IconURL: &localURL,
		Media: []catalog.Media{{
			Kind: "icon", AssetKey: "icon", URL: localURL,
			Source: "blizzard_api", SourceURL: "https://render.worldofwarcraft.com/us/icons/56/example.jpg",
			Locale: "en_US", MIMEType: "image/jpeg", CacheStatus: "cached", Primary: true,
		}},
	}
	got := toAPIEntity(entity)
	if got.Media == nil || len(*got.Media) != 1 {
		t.Fatalf("media mapping = %#v", got.Media)
	}
	asset := (*got.Media)[0]
	if asset.Kind != "icon" || asset.Source != "blizzard_api" || !asset.Primary {
		t.Fatalf("media provenance was lost in API mapping: %#v", asset)
	}
	if asset.Url != localURL || got.IconUrl == nil || *got.IconUrl != localURL {
		t.Fatalf("public media must use local cache URL: media=%q icon=%#v", asset.Url, got.IconUrl)
	}
}

func TestAPILibraryDatasetPreservesFreshnessAndCoverage(t *testing.T) {
	updatedAt := time.Unix(10, 0).UTC()
	build := "12.0.1.65000"
	previewIcon := "inv_sword_04"
	previewURL := "https://api.gildra.net/v1/media/79be8de3-77ba-436d-afd0-91a38146611a"
	itemClassID := 2
	got := toAPILibraryDataset(catalog.LibraryDataset{
		Slug: "weapons", Product: "wow", EntityType: "item", CategoryPath: "equipment/weapons",
		ItemClassID: &itemClassID,
		Group:       "equipment", IconSymbol: "#ic-sword", SortOrder: 20, Name: "Оружие",
		Description: "Оружие по типам", BuildVersion: &build, PreviewIconName: &previewIcon, PreviewImageURL: &previewURL, EntityCount: 100,
		LocalizedCount: 90, VerifiedLocalizedCount: 85, TooltipCount: 80, ImageCount: 70, Freshness: "fresh",
		Applicability: "applicable", ApplicabilityReason: "",
		FreshnessReason: "published data and coverage are current", CoverageUpdatedAt: &updatedAt,
	})
	if got.Slug != "weapons" || got.CategoryPath != "equipment/weapons" || got.ItemClassId == nil || *got.ItemClassId != 2 || got.Freshness != "fresh" {
		t.Fatalf("dataset identity or freshness was lost: %#v", got)
	}
	if got.TooltipCount != 80 || got.ImageCount != 70 || got.VerifiedLocalizedCount != 85 || got.CoverageUpdatedAt == nil {
		t.Fatalf("dataset coverage was lost: %#v", got)
	}
	if got.Applicability != "applicable" || got.ApplicabilityReason != "" {
		t.Fatalf("dataset applicability was lost: %#v", got)
	}
	if got.PreviewImageUrl == nil || *got.PreviewImageUrl != previewURL {
		t.Fatalf("dataset preview was lost: %#v", got.PreviewImageUrl)
	}
}

func TestAPIProductPreservesFreshness(t *testing.T) {
	freshness := "stale"
	reason := "опубликована старая сборка"
	product := catalog.Product{ID: 1, Slug: "wow_classic", Name: "World of Warcraft Classic", Freshness: freshness, FreshnessReason: reason}
	got := toAPIProduct(product)
	if got.Freshness == nil || string(*got.Freshness) != freshness || got.FreshnessReason == nil || *got.FreshnessReason != reason {
		t.Fatalf("product freshness was lost: %#v", got)
	}
}
