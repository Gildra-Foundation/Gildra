package rotationlab

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func nativeGearInput(t *testing.T) SimulationInput {
	t.Helper()
	var input SimulationInput
	// Decode the wire contract so this regression also runs before the field exists.
	err := json.Unmarshal([]byte(`{"spec":"fury-warrior","scenario":"single-target","fightLengthSeconds":120,"targets":1,"actionListMode":"native","talentLoadout":"CgEAAAAAAAAAAAAAAAAAAAAAAAAAAA","armory":{"profile":{"name":"Native gear audit"},"specializations":{},"equipment":{"equipped_items":[]}}}`), &input)
	if err != nil {
		t.Fatal(err)
	}
	return input
}

func TestNativeGearAPLContract(t *testing.T) {
	if err := ValidateInput(nativeGearInput(t)); err != nil {
		t.Fatalf("native gear scoring without an editor priority must be accepted: %v", err)
	}
	for _, body := range []string{
		`{"actionListMode":"arbitrary","rules":["rampage"]}`,
		`{"actionListMode":"native","rules":["rampage"]}`,
		`{"actionListMode":"native","aplRules":[{"id":"editor-rampage","abilityId":"rampage","source":"custom","conditions":[]}]}`,
	} {
		input := nativeGearInput(t)
		if err := json.Unmarshal([]byte(body), &input); err != nil {
			t.Fatal(err)
		}
		if err := ValidateInput(input); err == nil {
			t.Fatalf("ambiguous or unknown native APL contract accepted: %s", body)
		}
	}
	input := nativeGearInput(t)
	input.Armory = nil
	if err := ValidateInput(input); err == nil {
		t.Fatal("native gear mode must require the character snapshot")
	}
	input = nativeGearInput(t)
	input.TalentLoadout = ""
	if err := ValidateInput(input); err == nil {
		t.Fatal("native gear mode must require explicit character talents")
	}
}

func TestNativeGearAPLLeavesMaintainedItemActionsAndConditionsIntact(t *testing.T) {
	input := nativeGearInput(t)
	input.GearChanges = []GearChange{{Slot: "trinket1", ItemID: 194872, BonusIDs: []int{6652}}}
	engine := &SimCEngine{iterations: 750}
	dir := t.TempDir()
	profilePath, err := engine.profileForInput(input, dir)
	if err != nil {
		t.Fatal(err)
	}
	profile, err := os.ReadFile(profilePath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(profile), "trinket1=gildra_candidate,id=194872,source=local,bonus_id=6652") {
		t.Fatalf("exact replacement was not retained: %s", profile)
	}
	// No explicit list means SimC builds the specialization's maintained APL,
	// including item use, cooldown conditions and precombat setup. A generic
	// use_items appended to the editor's six-action list is not sufficient.
	for _, line := range append(strings.Split(string(profile), "\n"), engine.arguments(input, "report.json", profilePath)...) {
		if strings.HasPrefix(line, "actions") || strings.HasPrefix(line, "default_actions=0") {
			t.Fatalf("native gear score overrides the maintained APL and its item activation: %q", line)
		}
	}
}

func TestNativeGearAPLDoesNotChangeRotationEditor(t *testing.T) {
	input := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 120, Targets: 1,
		Rules: []string{"bloodthirst", "rampage"}, APLRules: []APLRule{
			{ID: "editor-bloodthirst", AbilityID: "bloodthirst", Source: "custom", Conditions: []APLCondition{{Type: "buff", Aura: "enrage", State: "down"}}},
			{ID: "editor-rampage", AbilityID: "rampage", Source: "custom", Conditions: []APLCondition{}},
		}}
	if err := ValidateInput(input); err != nil {
		t.Fatal(err)
	}
	engine := &SimCEngine{iterations: 750}
	args := strings.Join(engine.arguments(input, "report.json", "editor.simc"), "\n")
	for _, want := range []string{"default_actions=0", "actions=auto_attack", "actions+=/bloodthirst,if=buff.enrage.down\nactions+=/rampage"} {
		if !strings.Contains(args, want) {
			t.Fatalf("editor's existing priority/condition changed; missing %q in %s", want, args)
		}
	}
	if strings.Contains(args, "use_items") {
		t.Fatal("native gear scoring must not insert actions into the rotation editor")
	}
}

func TestNativeGearAPLReportUsesNativeMeasurementsAndSource(t *testing.T) {
	var report simcReport
	if err := json.Unmarshal([]byte(`{"version":"1210-01","sim":{"options":{"iterations":750,"confidence":0.95},"players":[{"collected_data":{"dps":{"mean":123456,"mean_std_dev":12.5},"total_iterations":750}}]}}`), &report); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if failure := recover(); failure != nil {
			t.Errorf("native report conversion must not require synthetic editor rules: %v", failure)
		}
	}()
	result, err := resultFromSimC(nativeGearInput(t), report, 123456)
	if err != nil {
		t.Fatal(err)
	}
	if result.DPS != 123456 || result.DPSError != 12.5 || result.Confidence != 95 || result.Accuracy.RotationSource != "simulationcraft-default-apl" {
		t.Fatalf("native measurements/source not retained: %#v", result)
	}
	if !strings.Contains(result.ModelNotice, "maintained default action priority list") {
		t.Fatalf("native APL is mislabeled: %s", result.ModelNotice)
	}
}

type nativeCaptureEngine struct{ input SimulationInput }

func (e *nativeCaptureEngine) Simulate(_ context.Context, input SimulationInput) (SimulationResult, error) {
	e.input = input
	return SimulationResult{Engine: "SimulationCraft native-contract", DPS: 123456}, nil
}

func TestNativeGearAPLWorkerAcceptsClosedWireContract(t *testing.T) {
	engine := &nativeCaptureEngine{}
	mux := http.NewServeMux()
	NewWorkerHandler(engine).Register(mux)
	input := nativeGearInput(t)
	// Construct independently of the Go model: pre-fix workers reject the new
	// field instead of silently accepting an incorrect custom action list.
	raw, _ := json.Marshal(input)
	var wire map[string]any
	_ = json.Unmarshal(raw, &wire)
	wire["actionListMode"] = "native"
	raw, _ = json.Marshal(wire)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(string(raw))))
	if response.Code != http.StatusCreated {
		t.Fatalf("native worker contract rejected: %d %s", response.Code, response.Body.String())
	}
	encoded, _ := json.Marshal(engine.input)
	if !strings.Contains(string(encoded), `"actionListMode":"native"`) || len(engine.input.Rules) != 0 {
		t.Fatalf("native mode was lost before reaching the engine: %s", encoded)
	}
}

func TestNativeGearAPLCannotFallBackToDeterministicScores(t *testing.T) {
	defer func() {
		if failure := recover(); failure != nil {
			t.Errorf("native mode must fail closed without SimC: %v", failure)
		}
	}()
	_, err := (DeterministicEngine{}).Simulate(context.Background(), nativeGearInput(t))
	if err == nil {
		t.Fatal("native gear scoring fell back to a deterministic training score")
	}
}

// Opt-in verification runs the actual pinned binary on an explicitly supplied
// fixture. It never calls a production worker or requires account credentials.
func TestNativeGearAPLPinnedArmory(t *testing.T) {
	binary := os.Getenv("GILDRA_NATIVE_APL_TEST_BINARY")
	fixture := os.Getenv("GILDRA_NATIVE_APL_TEST_INPUT")
	if binary == "" || fixture == "" {
		t.Skip("set GILDRA_NATIVE_APL_TEST_BINARY and GILDRA_NATIVE_APL_TEST_INPUT for isolated native verification")
	}
	raw, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	var input SimulationInput
	if err := json.Unmarshal(raw, &input); err != nil {
		t.Fatal(err)
	}
	if input.ActionListMode != ActionListModeNative {
		t.Fatal("fixture must explicitly request the native APL")
	}
	if err := ValidateInput(input); err != nil {
		t.Fatal(err)
	}
	engine, err := NewSimCEngine(binary, "", 750)
	if err != nil {
		t.Fatal(err)
	}
	report, err := engine.run(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	result, err := resultFromSimC(input, report, 0)
	if err != nil {
		t.Fatal(err)
	}
	if result.DPS <= 0 || result.Iterations <= 0 || result.Confidence != 95 || result.Accuracy.RotationSource != "simulationcraft-default-apl" {
		t.Fatalf("invalid pinned native score: %#v", result)
	}
	var itemActions []map[string]any
	for _, action := range report.Sim.Players[0].CollectedData.ActionSequence {
		if strings.HasPrefix(action.Name, "use_item") {
			itemActions = append(itemActions, map[string]any{"name": action.Name, "time": action.Time})
		}
	}
	if required := os.Getenv("GILDRA_NATIVE_APL_TEST_REQUIRED_ITEM_ACTION"); required != "" {
		found := false
		for _, action := range itemActions {
			found = found || action["name"] == required
		}
		if !found {
			t.Fatalf("required native equipment activation %q did not execute", required)
		}
	}
	evidence := map[string]any{
		"mode":          "actual pinned binary; isolated host process; explicit armory fixture; no production simulation request",
		"fixtureSHA256": fmt.Sprintf("%x", sha256.Sum256(raw)), "engine": result.Engine,
		"dps": result.DPS, "dpsError": result.DPSError, "iterations": result.Iterations, "confidence": result.Confidence,
		"rotationSource": result.Accuracy.RotationSource, "itemActions": itemActions,
		"nativeArguments": engine.arguments(input, "report.json", "armory.simc"),
	}
	if input.Spec == "fury-warrior" {
		legacy := input
		legacy.ActionListMode = ""
		legacy.Rules = append([]string(nil), baselineRules...)
		legacyReport, err := engine.run(context.Background(), legacy)
		if err != nil {
			t.Fatal(err)
		}
		legacyItemActions := 0
		for _, action := range legacyReport.Sim.Players[0].CollectedData.ActionSequence {
			if strings.HasPrefix(action.Name, "use_item") {
				legacyItemActions++
			}
		}
		if legacyItemActions != 0 {
			t.Fatalf("legacy six-rule control unexpectedly activates equipment: %d", legacyItemActions)
		}
		evidence["legacySixRuleControl"] = map[string]any{"itemActions": legacyItemActions,
			"dps":             legacyReport.Sim.Players[0].CollectedData.DPS.Mean,
			"comparisonScope": "entire APL changes; DPS difference is not an isolated item-effect contribution"}
	}
	encoded, _ := json.MarshalIndent(evidence, "", "  ")
	if output := os.Getenv("GILDRA_NATIVE_APL_TEST_OUTPUT"); output != "" {
		if err := os.WriteFile(output, encoded, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Log(string(encoded))
}
