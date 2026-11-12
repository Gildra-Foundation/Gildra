package main

import "testing"

func TestEnchantmentTextIsImportedPerLocale(t *testing.T) {
	if !contains(splitList(defaultTables), "SpellItemEnchantment") || !isLocalized("SpellItemEnchantment") {
		t.Fatal("Russian enchant text would not be imported")
	}
	if isLocalized("GemProperties") {
		t.Fatal("GemProperties references localized SpellItemEnchantment; it has no text itself")
	}
}
