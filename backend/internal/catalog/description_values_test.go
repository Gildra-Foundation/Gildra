package catalog

import "testing"

func TestResolveDescriptionTextUsesOnlyLoadedDB2Values(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		321291: {Effects: map[int]spellEffectValue{2: {BasePoints: 20}}},
		321973: {Effects: map[int]spellEffectValue{1: {BasePoints: 800}}},
		322098: {DurationMS: 7000, Effects: map[int]spellEffectValue{}},
		390628: {DurationMS: 10000, Effects: map[int]spellEffectValue{}},
	}
	raw := "Target dies within $322098d, granting ${$321973s1/100}. Below $s2%. Once every $390628d."
	got := resolveDescriptionText(raw, 321291, values, "en_US")
	want := "Target dies within 7 sec, granting 8. Below 20%. Once every 10 sec."
	if got != want {
		t.Fatalf("unexpected resolved description\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextUsesScalingFormulaInsteadOfFakeZero(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		17: {Effects: map[int]spellEffectValue{1: {Coefficient: 1.65}}},
	}
	if got := resolveDescriptionText("Absorbs $s1 damage.", 17, values, "en_US"); got != "Absorbs 1.65 × SP damage." {
		t.Fatalf("unexpected scaling description: %q", got)
	}
	if got := resolveDescriptionText("Deals $s2 damage.", 17, values, "en_US"); got != "Deals $s2 damage." {
		t.Fatalf("missing values must remain unresolved: %q", got)
	}
}

func TestResolveDescriptionTextPreservesUnknownTokens(t *testing.T) {
	raw := "Deals $s4 damage over $999999d."
	if got := resolveDescriptionText(raw, 123, map[int64]spellDescriptionValues{}, "en_US"); got != raw {
		t.Fatalf("unknown values must remain source-visible: %q", got)
	}
}

func TestResolveDescriptionTextResolvesSpellDescriptionReferences(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		10: {Description: "$@spelldesc20"},
		20: {Description: "Canonical description"},
	}
	if got := resolveDescriptionText("$@spelldesc10", 0, values, "en_US"); got != "Canonical description" {
		t.Fatalf("unexpected nested description: %q", got)
	}
}

func TestDescriptionLocaleDoesNotMixFallbackEnglishWithRussianUnits(t *testing.T) {
	if got := descriptionLocale("Deals damage for $10d.", "ru_RU"); got != "en_US" {
		t.Fatalf("expected English fallback, got %q", got)
	}
	if got := descriptionLocale("Наносит урон в течение $10d.", "ru_RU"); got != "ru_RU" {
		t.Fatalf("expected Russian text, got %q", got)
	}
}
