package httpapi

import (
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
)

func TestWowIconURL(t *testing.T) {
	icon := "Ability_Warrior_SavageBlow"
	got := wowIconURL(&icon)
	if got == nil || *got != "https://render.worldofwarcraft.com/us/icons/56/ability_warrior_savageblow.jpg" {
		t.Fatalf("unexpected icon URL: %v", got)
	}
	unsafe := "../secret"
	if got := wowIconURL(&unsafe); got != nil {
		t.Fatalf("unsafe icon name must be rejected: %q", *got)
	}
}

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
