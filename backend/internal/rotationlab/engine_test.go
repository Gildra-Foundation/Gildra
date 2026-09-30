package rotationlab

import (
	"strings"
	"testing"
)

func TestCalculateRespondsToPriorityOrder(t *testing.T) {
	baseline := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 120, Targets: 1, Rules: append([]string(nil), baselineRules...)}
	good := Calculate(baseline)
	baseline.Rules = []string{"whirlwind", "raging-blow", "bloodthirst", "execute", "odyns-fury", "rampage"}
	poor := Calculate(baseline)
	if poor.DPS >= good.DPS {
		t.Fatalf("poor priority DPS = %d, good = %d", poor.DPS, good.DPS)
	}
	if len(poor.Findings) <= len(good.Findings) {
		t.Fatalf("poor priority findings = %d, good = %d", len(poor.Findings), len(good.Findings))
	}
	if len(good.Casts) == 0 || len(good.Rage) == 0 {
		t.Fatal("simulation did not build timeline data")
	}
}

func TestValidateInputBounds(t *testing.T) {
	valid := SimulationInput{Spec: "fury-warrior", Scenario: "aoe", FightLengthSeconds: 60, Targets: 3, Rules: []string{"rampage"}}
	if err := ValidateInput(valid); err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}
	valid.Targets = 9
	if err := ValidateInput(valid); err == nil {
		t.Fatal("out-of-bounds targets accepted")
	}
}

func TestValidateInputRejectsMalformedTypedAPL(t *testing.T) {
	base := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: []string{"rampage"}}
	base.APLRules = []APLRule{{ID: "rule-rampage", AbilityID: "rampage", Source: "custom", Conditions: []APLCondition{{Type: "resource", Resource: "rage;iterations=1", Operator: "gte", Value: 80}}}}
	if err := ValidateInput(base); err == nil {
		t.Fatal("unsafe resource identifier accepted")
	}
	base.APLRules[0].Conditions = []APLCondition{{Type: "targets", Operator: "gte", Value: 9}}
	if err := ValidateInput(base); err == nil {
		t.Fatal("out-of-range target condition accepted")
	}
	base.APLRules[0].Conditions = []APLCondition{{Type: "execute", Operator: "lte", Value: 20}}
	if err := ValidateInput(base); err != nil {
		t.Fatalf("valid typed APL rejected: %v", err)
	}
}

func TestValidateInputAcceptsEveryRegisteredSpecialization(t *testing.T) {
	for spec := range supportedSpecs {
		input := SimulationInput{Spec: spec, Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: []string{"rotation-test"}}
		if err := ValidateInput(input); err != nil {
			t.Fatalf("registered specialization %q rejected: %v", spec, err)
		}
	}
}

func TestValidateInputRejectsUnsafeTalentLoadout(t *testing.T) {
	input := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: []string{"rampage"}, TalentLoadout: "valid-looking-but-has-a-newline\niterations=1"}
	if err := ValidateInput(input); err == nil {
		t.Fatal("unsafe talent loadout accepted")
	}
}

func TestValidateInputRequiresCompleteArmorySnapshot(t *testing.T) {
	input := SimulationInput{
		Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1,
		Rules: []string{"rampage"}, TalentLoadout: "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM",
		Armory: &ArmorySnapshot{Profile: []byte(`{"name":"Tester"}`), Specializations: []byte(`{}`), Equipment: []byte(`not-json`)},
	}
	if err := ValidateInput(input); err == nil || !strings.Contains(err.Error(), "equipment") {
		t.Fatalf("invalid armory equipment must be rejected, got %v", err)
	}
	input.Armory.Equipment = []byte(`{"equipped_items":[]}`)
	input.TalentLoadout = ""
	if err := ValidateInput(input); err == nil || !strings.Contains(err.Error(), "explicit talent loadout") {
		t.Fatalf("armory request without talents must be rejected, got %v", err)
	}
}

func TestValidateInputRejectsInvalidGearReplacementBeforeSimulation(t *testing.T) {
	input := SimulationInput{
		Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1,
		Rules: []string{"rampage"}, TalentLoadout: "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM",
		Armory:     &ArmorySnapshot{Profile: []byte(`{"name":"Tester"}`), Specializations: []byte(`{}`), Equipment: []byte(`{"equipped_items":[]}`)},
		GearChange: &GearChange{Slot: "trinket1", ItemID: 270171, BonusIDs: []int{12345}},
	}
	if err := ValidateInput(input); err != nil {
		t.Fatalf("valid gear replacement rejected: %v", err)
	}
	input.GearChange.Slot = "head\niterations=1"
	if err := ValidateInput(input); err == nil {
		t.Fatal("unsafe slot accepted")
	}
	input.GearChange.Slot = "trinket1"
	input.GearChange.BonusIDs = nil
	if err := ValidateInput(input); err == nil {
		t.Fatal("unversioned item accepted")
	}
	input.GearChange.BonusIDs = []int{12345, 12345}
	if err := ValidateInput(input); err == nil {
		t.Fatal("duplicate bonus ids accepted")
	}
}
