package catalogquality

import "testing"

func TestPublicQualityProfileIsExplicitlyScoped(t *testing.T) {
	profile, err := PublicQualityProfileFor("")
	if err != nil {
		t.Fatal(err)
	}
	if profile.Key != QualityProfileMidnightActive || !profile.RequiresRussianProof {
		t.Fatalf("unexpected default quality profile: %#v", profile)
	}
	if _, err := PublicQualityProfileFor("whole-wow"); err == nil {
		t.Fatal("unscoped historical profile must not be accepted")
	}
}

func TestPublicQualityGateBlocksCriticalProfileFailures(t *testing.T) {
	readiness := ReadinessReport{DataReady: true, ProductionReady: true}
	ApplyPublicQualityGate(&readiness, PublicQualitySnapshot{
		Profile:     QualityProfileMidnightActive,
		ActiveBuild: true, Raw: 10, Eligible: 10,
		English:           LocaleQuality{Technical: 1},
		Russian:           LocaleQuality{Fallback: 2},
		UnresolvedTooltip: 1, MissingPrimaryMedia: 1, FailedImports: 1,
	})
	if readiness.ProductionReady {
		t.Fatalf("critical scoped quality failures must block production: %#v", readiness)
	}
	for _, key := range []string{"public_nontechnical_english_names", "public_russian_names", "public_unresolved_templates", "public_media_backlog", "public_import_failures"} {
		found := false
		for _, check := range readiness.Checks {
			if check.Key == key && check.Status == "fail" && check.Blocking {
				found = true
			}
		}
		if !found {
			t.Errorf("missing blocking quality check %q: %#v", key, readiness.Checks)
		}
	}
}

func TestPublicQualityGateDoesNotTreatReviewRowsAsPublicFailures(t *testing.T) {
	readiness := ReadinessReport{DataReady: true, ProductionReady: true}
	ApplyPublicQualityGate(&readiness, PublicQualitySnapshot{
		Profile: QualityProfileMidnightActive, ActiveBuild: true, Raw: 10, Eligible: 6, Review: 3, Excluded: 1,
	})
	if !readiness.ProductionReady {
		t.Fatalf("held rows should not block a scoped public cohort by themselves: %#v", readiness)
	}
}

func TestPublicQualityGateRequiresActiveBuild(t *testing.T) {
	readiness := ReadinessReport{DataReady: true, ProductionReady: true}
	ApplyPublicQualityGate(&readiness, PublicQualitySnapshot{
		Profile: QualityProfileMidnightActive, Raw: 10, Eligible: 10,
	})
	if readiness.ProductionReady {
		t.Fatal("staged data must not pass the active-build public gate")
	}
}

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
