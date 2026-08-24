package catalog

import "testing"

func TestCompareVersionFieldsReportsOnlyChangedSupportedFields(t *testing.T) {
	t.Parallel()
	from := EntityVersion{Name: "Old name", Description: "Same"}
	to := EntityVersion{Name: "New name", Description: "Same"}
	fromFacts := map[string]any{"item_level": float64(50), "ignored": "old"}
	toFacts := map[string]any{"item_level": float64(60), "ignored": "new"}

	changes := compareVersionFields(from, to, fromFacts, toFacts, "en_US")
	if len(changes) != 2 {
		t.Fatalf("got %d changes, want 2: %#v", len(changes), changes)
	}
	if changes[0].Field != "name" || changes[1].Field != "item_level" {
		t.Fatalf("unexpected compared fields: %#v", changes)
	}
}

func TestSelectComparisonVersionsUsesDifferentBuilds(t *testing.T) {
	t.Parallel()
	versions := []EntityVersion{
		{BuildID: 20, BuildNumber: 200, Revision: 2},
		{BuildID: 20, BuildNumber: 200, Revision: 1},
		{BuildID: 10, BuildNumber: 100, Revision: 3},
	}
	from, to, ok := selectComparisonVersions(versions, nil, nil)
	if !ok {
		t.Fatal("expected two distinct builds")
	}
	if from.BuildID != 10 || from.Revision != 3 || to.BuildID != 20 || to.Revision != 2 {
		t.Fatalf("selected (%d rev %d) -> (%d rev %d)", from.BuildID, from.Revision, to.BuildID, to.Revision)
	}
}

func TestSelectComparisonVersionsUsesNewestRevisionForExplicitBuilds(t *testing.T) {
	t.Parallel()
	versions := []EntityVersion{
		{BuildID: 20, Revision: 2}, {BuildID: 20, Revision: 1},
		{BuildID: 10, Revision: 3}, {BuildID: 10, Revision: 2},
	}
	fromBuild, toBuild := int64(10), int64(20)
	from, to, ok := selectComparisonVersions(versions, &fromBuild, &toBuild)
	if !ok || from.Revision != 3 || to.Revision != 2 {
		t.Fatalf("selected %#v -> %#v, ok=%v", from, to, ok)
	}
}

func TestNormalizeComparisonQuality(t *testing.T) {
	t.Parallel()
	if got := normalizeComparisonValue("quality", "RARE"); got != "3" {
		t.Fatalf("normalizeComparisonValue() = %v, want 3", got)
	}
}

func TestQualityLabelUsesRequestedLocale(t *testing.T) {
	t.Parallel()
	if got := qualityLabel("ru_RU", "Name", "Название"); got != "Название" {
		t.Fatalf("got %q", got)
	}
	if got := qualityLabel("en_US", "Name", "Название"); got != "Name" {
		t.Fatalf("got %q", got)
	}
}
