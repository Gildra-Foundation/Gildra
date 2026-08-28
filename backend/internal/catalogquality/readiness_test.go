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

func TestRecoveryPolicyKeepsOffHostAsDefault(t *testing.T) {
	pattern, key, _, err := RecoveryPolicySettings("")
	if err != nil {
		t.Fatal(err)
	}
	if pattern != `^(s3|r2|swift)://` || key != "off_host_restore_proof" {
		t.Fatalf("unexpected default recovery settings: pattern=%q key=%q", pattern, key)
	}
}

func TestRecoveryPolicyAllowsSameHostOnlyWhenExplicit(t *testing.T) {
	pattern, key, _, err := RecoveryPolicySettings(RecoveryPolicyVerifiedSameHost)
	if err != nil {
		t.Fatal(err)
	}
	if pattern != `^(file|s3|r2|swift)://` || key != "verified_restore_proof" {
		t.Fatalf("unexpected same-host recovery settings: pattern=%q key=%q", pattern, key)
	}
	if _, _, _, err := RecoveryPolicySettings("local"); err == nil {
		t.Fatal("unknown recovery policy must fail closed")
	}
}
