package catalog

import (
	"testing"

	"github.com/google/uuid"
)

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

func TestProductFreshnessRequiresPublishedBuild(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name          string
		active        string
		releaseStatus string
		release       string
		check         string
		observed      string
		pipeline      string
		wantState     string
	}{
		{name: "retail published and current", active: "12.1.0.69497", releaseStatus: "published", release: "12.1.0.69497", check: "current", observed: "12.1.0.69497", wantState: "fresh"},
		{name: "staging is not public", active: "1.15.9.69547", check: "update_available", observed: "1.15.9.69547", wantState: "empty"},
		{name: "published build behind active", active: "12.1.0.69587", releaseStatus: "published", release: "12.1.0.69497", check: "update_available", observed: "12.1.0.69587", wantState: "stale"},
		{name: "refresh in progress", active: "12.1.0.69587", releaseStatus: "published", release: "12.1.0.69497", pipeline: "running", wantState: "refreshing"},
		{name: "failed without release", active: "5.5.4.69383", pipeline: "failed", wantState: "failed"},
		{name: "no active build", wantState: "empty"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state, reason := productFreshness(tt.active, tt.releaseStatus, tt.release, tt.check, tt.observed, tt.pipeline)
			if state != tt.wantState {
				t.Fatalf("state = %q, want %q (reason: %s)", state, tt.wantState, reason)
			}
			if reason == "" {
				t.Fatal("freshness reason must be present")
			}
		})
	}
}
