package main

import (
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
)

func TestEnforceReadinessFailsClosedWhenRequired(t *testing.T) {
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: false}, true); err == nil {
		t.Fatal("production gate accepted a report that is not production ready")
	}
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: true}, true); err != nil {
		t.Fatalf("production gate rejected a ready report: %v", err)
	}
}

func TestEnforceReadinessRemainsReportOnlyByDefault(t *testing.T) {
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: false}, false); err != nil {
		t.Fatalf("report-only audit unexpectedly failed: %v", err)
	}
}
