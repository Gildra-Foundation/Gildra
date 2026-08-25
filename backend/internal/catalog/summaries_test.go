package catalog

import (
	"testing"

	"github.com/google/uuid"
)

func TestSummaryHighlightsAreBoundedAndSourceBacked(t *testing.T) {
	t.Parallel()
	requiredLevel, cooldown := 80, 120000
	inventory, school, cast := "Two-Hand", "Fire", "2 sec"
	got := summaryHighlights("en_US", &requiredLevel, &inventory, &school, &cast, &cooldown)
	if len(got) != 3 {
		t.Fatalf("len(highlights) = %d, want 3", len(got))
	}
	if got[0].Key != "required_level" || got[0].Value != "Requires level 80" {
		t.Fatalf("unexpected first highlight: %#v", got[0])
	}
}

func TestInventoryTypeSummary(t *testing.T) {
	t.Parallel()
	if got := inventoryTypeSummary("6", "ru_RU"); got != "Пояс" {
		t.Fatalf("inventoryTypeSummary() = %q, want %q", got, "Пояс")
	}
	if got := inventoryTypeSummary("0", "en_US"); got != "" {
		t.Fatalf("inventoryTypeSummary() should hide non-equipment type, got %q", got)
	}
	if got := inventoryTypeSummary("unexpected", "en_US"); got != "" {
		t.Fatalf("inventoryTypeSummary() should hide invalid type, got %q", got)
	}
}

func TestSummaryRankedCursorRoundTrip(t *testing.T) {
	t.Parallel()
	wantID := uuid.MustParse("2ee4ba23-c3f5-49ac-9d40-9d5467e95070")
	wantRank := 8123
	cursor := encodeSummaryCursor(wantID, wantRank, true)
	gotID, gotRank, err := decodeSummaryCursor(cursor, true)
	if err != nil {
		t.Fatal(err)
	}
	if gotID != wantID || gotRank == nil || *gotRank != wantRank {
		t.Fatalf("decodeSummaryCursor() = (%s, %v), want (%s, %d)", gotID, gotRank, wantID, wantRank)
	}
}

func TestSummaryRankedCursorRejectsLegacyCursor(t *testing.T) {
	t.Parallel()
	legacy := encodeCursor(uuid.MustParse("2ee4ba23-c3f5-49ac-9d40-9d5467e95070"))
	if _, _, err := decodeSummaryCursor(legacy, true); err == nil {
		t.Fatal("expected ranked search to reject a legacy cursor")
	}
}

func TestSummaryFilterPathsDeduplicates(t *testing.T) {
	t.Parallel()
	got, err := summaryFilterPaths("classes/mage", []string{"classes/mage", "equipment/head", ""})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "classes/mage" || got[1] != "equipment/head" {
		t.Fatalf("summaryFilterPaths() = %#v", got)
	}
}

func TestSummaryFilterPathsRejectsTooMany(t *testing.T) {
	t.Parallel()
	facets := []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"}
	if _, err := summaryFilterPaths("", facets); err == nil {
		t.Fatal("expected too many facets to be rejected")
	}
}

func TestSummaryAcquisitionMethodsDeduplicate(t *testing.T) {
	t.Parallel()
	got, err := summaryAcquisitionMethods([]string{"quest", " DROP ", "quest", ""})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "quest" || got[1] != "drop" {
		t.Fatalf("summaryAcquisitionMethods() = %#v", got)
	}
}

func TestSummaryAcquisitionMethodsRejectUnknown(t *testing.T) {
	t.Parallel()
	if _, err := summaryAcquisitionMethods([]string{"auction_house"}); err == nil {
		t.Fatal("expected an unsupported acquisition method to fail")
	}
}
