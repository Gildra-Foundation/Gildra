package main

import "testing"

func TestParseBuildNumber(t *testing.T) {
	got, err := parseBuildNumber("12.0.1.63534")
	if err != nil || got != 63534 {
		t.Fatalf("parseBuildNumber() = %d, %v", got, err)
	}
	if _, err := parseBuildNumber("live"); err == nil {
		t.Fatal("parseBuildNumber() accepted an invalid build")
	}
}

func TestWagoProductKeyKeepsEditionsSeparate(t *testing.T) {
	tests := map[string]string{
		"wow":                  "wow",
		"wow_classic":          "wow_classic",
		"wow_classic_era":      "wow_classic_era",
		"wow_classic_hardcore": "wow_classic_era",
	}
	for product, want := range tests {
		got, err := wagoProductKey(product)
		if err != nil {
			t.Fatalf("wagoProductKey(%q) returned error: %v", product, err)
		}
		if got != want {
			t.Errorf("wagoProductKey(%q) = %q, want %q", product, got, want)
		}
	}
	if _, err := wagoProductKey("genshin"); err == nil {
		t.Fatal("wagoProductKey accepted an unsupported product")
	}
}
