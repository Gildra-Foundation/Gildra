package main

import "testing"

func TestParseProductsDefaultsToLegacyProduct(t *testing.T) {
	t.Parallel()
	got, err := parseProducts("", "wow")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "wow" {
		t.Fatalf("products = %v", got)
	}
}

func TestParseProductsAcceptsAllWowEditionsAndDeduplicates(t *testing.T) {
	t.Parallel()
	got, err := parseProducts("wow,wow_classic,wow_classic_era,wow_classic_hardcore,wow", "unused")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 {
		t.Fatalf("product count = %d, want 4", len(got))
	}
}

func TestParseProductsRejectsUnknownProduct(t *testing.T) {
	t.Parallel()
	if _, err := parseProducts("wow_vanilla", "wow"); err == nil {
		t.Fatal("expected unknown product error")
	}
}
