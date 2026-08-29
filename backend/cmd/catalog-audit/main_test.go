package main

import (
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
)

func TestEnforceReadinessFailsClosedWhenRequired(t *testing.T) {
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: false}, false, true); err == nil {
		t.Fatal("production gate accepted a report that is not production ready")
	}
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: true}, false, true); err != nil {
		t.Fatalf("production gate rejected a ready report: %v", err)
	}
}

func TestEnforceReadinessSupportsPrivateDataGate(t *testing.T) {
	if err := enforceReadiness(catalogquality.ReadinessReport{DataReady: false}, true, false); err == nil {
		t.Fatal("private data gate accepted a report that is not data ready")
	}
	if err := enforceReadiness(catalogquality.ReadinessReport{DataReady: true, ProductionReady: false}, true, false); err != nil {
		t.Fatalf("private data gate rejected source-complete private data: %v", err)
	}
}

func TestEnforceReadinessRemainsReportOnlyByDefault(t *testing.T) {
	if err := enforceReadiness(catalogquality.ReadinessReport{ProductionReady: false}, false, false); err != nil {
		t.Fatalf("report-only audit unexpectedly failed: %v", err)
	}
}
