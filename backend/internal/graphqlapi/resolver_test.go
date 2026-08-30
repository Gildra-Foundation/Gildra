package graphqlapi

import (
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
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
		Localizations: map[string]catalog.EntityLocalization{
			"en_US": {Name: "Fireball", Description: "Hurls a fiery ball.", ResolvedDescription: "Hurls a fiery ball."},
			"ru_RU": {Name: "Огненный шар", Description: "Бросает $s1 ед. урона.", ResolvedDescription: "Бросает 100 ед. урона."},
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
}
