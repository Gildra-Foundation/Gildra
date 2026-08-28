package main

import (
	"strings"
	"testing"
)

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
	if !isLocalized("ItemSparse") || !isLocalized("Spell") || !isLocalized("TraitDefinition") ||
		!isLocalized("UiMap") || isLocalized("SpellPower") {
		t.Fatal("localized DB2 table classification is incorrect")
	}
}

func TestValidProduct(t *testing.T) {
	t.Parallel()
	for _, product := range []string{"wow", "wow_classic", "wow_classic_era", "wow_classic_hardcore"} {
		if !validProduct(product) {
			t.Fatalf("expected product %q to be supported", product)
		}
	}
	if validProduct("wowhead") {
		t.Fatal("unexpected non-game product support")
	}
}

func TestItemEffectsSupportClassicParentItemLinks(t *testing.T) {
	t.Parallel()
	if !strings.Contains(itemDetailsProjectionSQL, "ParentItemID") ||
		!strings.Contains(itemDetailsProjectionSQL, "ItemXItemEffect") {
		t.Fatal("item effect projection must support both Classic and Retail link layouts")
	}
}

func TestCraftingAcquisitionsAreScopedToProductAndBuild(t *testing.T) {
	t.Parallel()
	for _, predicate := range []string{
		"recipe_version.build_id=$1",
		"recipe.product_id=$2",
	} {
		if !strings.Contains(itemDetailsProjectionSQL, predicate) {
			t.Fatalf("crafting acquisition projection is missing %q", predicate)
		}
	}
}
