package catalog

import (
	"testing"

	"github.com/google/uuid"
)

func TestProductFreshnessRequiresMatchingImportedBuild(t *testing.T) {
	active := "12.1.0.69497"
	observed := "12.1.0.69497"
	status := "current"
	state, reason := productFreshness(Product{BuildVersion: &active, SourceBuildVersion: &observed, SourceStatus: &status})
	if state != "fresh" || reason == "" {
		t.Fatalf("matching build freshness = %q (%q), want fresh", state, reason)
	}

	observed = "12.1.0.69547"
	state, _ = productFreshness(Product{BuildVersion: &active, SourceBuildVersion: &observed, SourceStatus: &status})
	if state != "stale" {
		t.Fatalf("mismatched current check freshness = %q, want stale", state)
	}
}

func TestProductFreshnessDistinguishesSourceStates(t *testing.T) {
	active := "5.5.4.67732"
	observed := "5.5.4.69383"
	for _, test := range []struct {
		status string
		want   string
	}{
		{status: "update_available", want: "stale"},
		{status: "failed", want: "failed"},
	} {
		status := test.status
		state, _ := productFreshness(Product{BuildVersion: &active, SourceBuildVersion: &observed, SourceStatus: &status})
		if state != test.want {
			t.Fatalf("status %q freshness = %q, want %q", test.status, state, test.want)
		}
	}
	state, _ := productFreshness(Product{})
	if state != "unknown" {
		t.Fatalf("missing source check freshness = %q, want unknown", state)
	}
}

func TestCursorRoundTrip(t *testing.T) {
	t.Parallel()
	want := uuid.MustParse("2ee4ba23-c3f5-49ac-9d40-9d5467e95070")
	got, err := decodeCursor(encodeCursor(want))
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("cursor decoded to %s, want %s", got, want)
	}
}

func TestDecodeCursorRejectsInvalidValue(t *testing.T) {
	t.Parallel()
	if _, err := decodeCursor("not-a-cursor"); err == nil {
		t.Fatal("expected invalid cursor error")
	}
}
