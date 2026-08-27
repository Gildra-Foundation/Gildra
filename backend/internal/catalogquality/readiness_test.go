package catalogquality

import "testing"

func TestReadinessScopesKeepDataAndProductionDecisionsSeparate(t *testing.T) {
	report := ReadinessReport{DataReady: true, ProductionReady: true}
	report.add("data", ScopeData, true, 1, "data failure")
	if report.DataReady || report.ProductionReady {
		t.Fatalf("data failure must block both decisions: %#v", report)
	}

	report = ReadinessReport{DataReady: true, ProductionReady: true}
	report.add("policy", ScopeProduction, true, 1, "policy failure")
	if !report.DataReady || report.ProductionReady {
		t.Fatalf("production-only failure must retain data readiness: %#v", report)
	}
}

func TestReadinessWarningsNeverBlock(t *testing.T) {
	report := ReadinessReport{DataReady: true, ProductionReady: true}
	report.warn("fallback", ScopeData, 12, "source translation absent")
	if !report.DataReady || !report.ProductionReady || len(report.Checks) != 1 || report.Checks[0].Status != "warning" {
		t.Fatalf("warning changed readiness: %#v", report)
	}
}
