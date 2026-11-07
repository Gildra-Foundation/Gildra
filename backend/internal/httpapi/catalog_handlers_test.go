package httpapi

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/google/uuid"
)

// The web sitemap lists a /ru/library URL only when slugRu is a string; a
// missing Russian name must serialize as an explicit null, never "".
func TestSitemapEntriesResponseSerializesRussianSlug(t *testing.T) {
	t.Parallel()
	updated := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	ru := "ognennyj-shar"
	data := sitemapEntriesResponse([]catalog.SitemapEntry{
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Type: "spell", Slug: "fireball", SlugRu: &ru, UpdatedAt: updated},
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000002"), Type: "spell", Slug: "frostbolt", UpdatedAt: updated},
	})
	encoded, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"id":"00000000-0000-0000-0000-000000000001","slug":"fireball","slugRu":"ognennyj-shar","type":"spell","updatedAt":"2026-11-07T10:00:00Z"},` +
		`{"id":"00000000-0000-0000-0000-000000000002","slug":"frostbolt","slugRu":null,"type":"spell","updatedAt":"2026-11-07T10:00:00Z"}]`
	if string(encoded) != want {
		t.Fatalf("sitemap entries JSON\n got %s\nwant %s", encoded, want)
	}
}
