package rotationlab

import (
	"strings"
	"testing"
)

func TestGearEnhancementEmptySocketPositions(t *testing.T) {
	input := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: []string{"rampage"}, TalentLoadout: strings.Repeat("A", 30), Armory: &ArmorySnapshot{Profile: []byte(`{}`), Equipment: []byte(`{}`), Specializations: []byte(`{}`)}, GearChange: &GearChange{Slot: "head", ItemID: 123}}
	for _, gems := range [][]int{{0, 240967, 0}, {240967, 0, 240967}, {0, 0, 0}, {0}, nil} {
		input.GearChange.GemIDs = gems
		if err := ValidateInput(input); err != nil {
			t.Fatalf("valid positional gems %v rejected: %v", gems, err)
		}
	}
	input.GearChange.GemIDs = []int{0, 240967, 0}
	line := serializeGearChange(*input.GearChange)
	if !strings.Contains(line, ",gem_id=0/240967/0") {
		t.Fatalf("socket positions changed: %s", line)
	}
	if strings.Contains(line, "enchant_id=") {
		t.Fatalf("zero enchant should be omitted from full replacement: %s", line)
	}
	input.GearChange.EnchantID = 7961
	if !strings.Contains(serializeGearChange(*input.GearChange), ",enchant_id=7961") {
		t.Fatal("explicit enchant lost")
	}
	input.GearChange.EnchantID = 0
	for _, gems := range [][]int{{-1}, {0, -1, 0}, {10000001}, {0, 0, 0, 0}} {
		input.GearChange.GemIDs = gems
		if err := ValidateInput(input); err == nil {
			t.Fatalf("invalid gems accepted: %v", gems)
		}
	}
	input.GearChange.GemIDs = []int{0, 240967, 0}
	input.GearChanges = []GearChange{*input.GearChange}
	input.GearChange = nil
	if err := ValidateInput(input); err != nil {
		t.Fatalf("multi-slot request rejected: %v", err)
	}
	input.GearChanges[0].GemIDs = []int{-1}
	if err := ValidateInput(input); err == nil {
		t.Fatal("negative gem accepted in multi-slot request")
	}
}
