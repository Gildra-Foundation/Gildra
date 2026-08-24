package main

import "testing"

func TestParseBuildNumber(t *testing.T) {
	t.Parallel()
	got, err := parseBuildNumber("12.1.0.69404")
	if err != nil {
		t.Fatal(err)
	}
	if got != 69404 {
		t.Fatalf("build number = %d", got)
	}
}

func TestLocalizedTables(t *testing.T) {
	t.Parallel()
	if !isLocalized("ItemSparse") || !isLocalized("Spell") || !isLocalized("TraitDefinition") || isLocalized("SpellPower") {
		t.Fatal("localized DB2 table classification is incorrect")
	}
}
