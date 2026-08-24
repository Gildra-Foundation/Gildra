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
