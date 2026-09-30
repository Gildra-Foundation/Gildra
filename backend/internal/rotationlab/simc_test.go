package rotationlab

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSimCProfileUsesBattleNetArmoryJSON(t *testing.T) {
	tempDir := t.TempDir()
	engine := &SimCEngine{iterations: 1}
	input := SimulationInput{
		Spec: "fury-warrior", TalentLoadout: "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM",
		Armory: &ArmorySnapshot{Profile: json.RawMessage(`{"name":"Tester"}`), Specializations: json.RawMessage(`{"active_specialization":{"id":72}}`), Equipment: json.RawMessage(`{"equipped_items":[]}`)},
	}
	path, err := engine.profileForInput(input, tempDir)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	profile := string(payload)
	for _, expected := range []string{"local_json=", "character.json", "spec=", "specializations.json", "equipment=", "equipment.json"} {
		if !strings.Contains(profile, expected) {
			t.Fatalf("armory profile missing %q: %q", expected, profile)
		}
	}
	for _, name := range []string{"character.json", "specializations.json", "equipment.json"} {
		info, statErr := os.Stat(filepath.Join(tempDir, name))
		if statErr != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("%s must exist with 0600 permissions", name)
		}
	}
}

func TestSimCProfileAppliesOnlyStructuredGearReplacement(t *testing.T) {
	tempDir := t.TempDir()
	engine := &SimCEngine{iterations: 1}
	input := SimulationInput{
		Spec: "fury-warrior", TalentLoadout: "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM",
		Armory:     &ArmorySnapshot{Profile: json.RawMessage(`{"name":"Tester"}`), Specializations: json.RawMessage(`{"active_specialization":{"id":72}}`), Equipment: json.RawMessage(`{"equipped_items":[]}`)},
		GearChange: &GearChange{Slot: "main_hand", ItemID: 268264, BonusIDs: []int{12040, 12345}, EnchantID: 7777, GemIDs: []int{250001, 250002}},
	}
	path, err := engine.profileForInput(input, tempDir)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "main_hand=gildra_candidate,id=268264,bonus_id=12040/12345,enchant_id=7777,gem_id=250001/250002"
	if !strings.Contains(string(payload), want) {
		t.Fatalf("gear override missing: %q", payload)
	}
}

func TestSimCProfileRemovesMaintainedActionListsForCustomPriority(t *testing.T) {
	profileDir := t.TempDir()
	tempDir := t.TempDir()
	source := "warrior=Tester\nspec=arms\nactions=mortal_strike\nactions.test+=/overpower\ntalents=example\n"
	if err := os.WriteFile(filepath.Join(profileDir, "MID2_Warrior_Arms.simc"), []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
	engine := &SimCEngine{profileDir: profileDir}
	path, err := engine.profileForInput(SimulationInput{Spec: "arms-warrior"}, tempDir)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if strings.Contains(text, "actions") || !strings.Contains(text, "talents=example") {
		t.Fatalf("unexpected sanitized profile: %q", text)
	}
}

func TestResultFromSimCUsesEngineMeasurements(t *testing.T) {
	var report simcReport
	payload := `{
		"version":"1210-01",
		"sim":{"options":{"iterations":500,"confidence":0.95},"players":[{
			"collected_data":{
				"dps":{"mean":164321},"total_iterations":500,
				"buffed_stats":{"attribute":{"strength":12345,"agility":10,"intellect":20},"stats":{"crit_pct":0.21,"haste_pct":0.18,"mastery_pct":0.32,"versatility_pct":0.07}},
				"timeline_dmg":{"data":[120000,160000,180000]},
				"resource_lost":{"rage":{"mean":1000}},
				"resource_overflowed":{"rage":{"mean":25}},
				"resource_timelines":{"rage":{"data":[0,65,130]}},
				"action_sequence":[
					{"time":0,"name":"recklessness","resources":{"rage":20},"resources_max":{"rage":130}},
					{"time":1.5,"name":"rampage","resources":{"rage":90},"resources_max":{"rage":130}},
					{"time":3,"name":"bloodthirst","resources":{"rage":35},"resources_max":{"rage":130}}
				]
			},
			"buffs":[{"name":"enrage","uptime":94.2}],
			"stats":[{"name":"rampage","num_executes":{"mean":30}},{"name":"bloodthirst","num_executes":{"mean":20}}]
		}]}}
	`
	if err := json.Unmarshal([]byte(payload), &report); err != nil {
		t.Fatal(err)
	}
	input := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: append([]string(nil), baselineRules...)}
	result, err := resultFromSimC(input, report, 160000)
	if err != nil {
		t.Fatal(err)
	}
	if result.Engine != "SimulationCraft 1210-01" || result.DPS != 164321 || result.Iterations != 500 {
		t.Fatalf("unexpected engine result: %#v", result)
	}
	if result.CombatStats.Primary != 12345 || result.CombatStats.Crit != 21 || result.CombatStats.Haste != 18 || result.CombatStats.Mastery != 32 || result.CombatStats.Versatility != 7 {
		t.Fatalf("unexpected simulated combat stats: %#v", result.CombatStats)
	}
	if result.EnrageUptime != 94.2 || result.RageEfficiency != 97.5 || result.CastsPerMinute != 3 {
		t.Fatalf("unexpected metrics: enrage=%v rage=%v cpm=%v", result.EnrageUptime, result.RageEfficiency, result.CastsPerMinute)
	}
	if len(result.Casts) != 3 || len(result.Rage) != 3 || result.Rage[2].Value != 100 {
		t.Fatalf("unexpected timeline: casts=%d rage=%#v", len(result.Casts), result.Rage)
	}
	if strings.Join(result.RecommendedSequence, ",") != "recklessness,rampage,bloodthirst" {
		t.Fatalf("unexpected recommended sequence: %#v", result.RecommendedSequence)
	}
}

func TestCombatStateExtractionTracksResourceCooldownAndProcWindows(t *testing.T) {
	var sequence []simcAction
	if err := json.Unmarshal([]byte(`[
		{"time":0,"name":"major_burst","resources":{"energy":100},"resources_max":{"energy":100},"buffs":[{"name":"clearcasting"}]},
		{"time":1.5,"name":"builder","resources":{"energy":70},"resources_max":{"energy":100},"buffs":[{"name":"clearcasting"}],"cooldowns":[{"id":123,"name":"major_burst","remains":10.5}]},
		{"time":3,"name":"spender","resources":{"energy":30},"resources_max":{"energy":100},"buffs":[],"cooldowns":[{"id":123,"name":"major_burst","remains":9}]},
		{"time":12,"name":"major_burst","resources":{"energy":90},"resources_max":{"energy":100},"buffs":[]},
		{"time":13.5,"name":"builder","resources":{"energy":60},"resources_max":{"energy":100},"buffs":[],"cooldowns":[{"id":123,"name":"major_burst","remains":10.5}]}
	]`), &sequence); err != nil {
		t.Fatal(err)
	}
	player := simcPlayer{}
	player.CollectedData.ActionSequence = sequence
	player.CollectedData.ResourceTimelines = map[string]simcTimeline{"energy": {Data: []float64{100, 70, 30, 90, 60}}}
	player.CollectedData.ResourceLost = map[string]simcSample{"energy": {Mean: 100}}
	player.CollectedData.ResourceOverflowed = map[string]simcSample{"energy": {Mean: 5}}

	resources := simcResources("outlaw-rogue", player, 30)
	if len(resources) != 1 || resources[0].Key != "energy" || resources[0].Maximum != 100 || resources[0].Efficiency != 95 {
		t.Fatalf("unexpected resources: %#v", resources)
	}
	procs := simcProcs(sequence, 30)
	if len(procs) != 1 || procs[0].Name != "Clearcasting" || procs[0].Time != 0 || procs[0].Duration != 3 {
		t.Fatalf("unexpected proc windows: %#v", procs)
	}
	cooldowns := simcCooldowns(sequence, 30)
	if len(cooldowns) != 1 || cooldowns[0].AbilityID != "major-burst" || cooldowns[0].AverageInterval != 12 || cooldowns[0].Duration != 10.5 {
		t.Fatalf("unexpected cooldowns: %#v", cooldowns)
	}
}

func TestSimCResourcesUsesFullStateForInitialRuneCount(t *testing.T) {
	player := simcPlayer{}
	player.CollectedData.ActionSequence = []simcAction{{
		Time: 0, Name: "obliterate",
		Resources: map[string]float64{"rune": 6}, ResourcesMax: map[string]float64{"rune": 6},
	}}
	player.CollectedData.ResourceTimelines = map[string]simcTimeline{"rune": {Data: []float64{0, 4, 3}}}
	resources := simcResources("frost-death-knight", player, 30)
	if len(resources) != 1 || len(resources[0].Points) == 0 || resources[0].Points[0].Value != 100 {
		t.Fatalf("initial rune state must come from the first full-state action: %#v", resources)
	}
}

func TestSimCArgumentsUseCustomAPLAndFullCombatState(t *testing.T) {
	engine := &SimCEngine{profile: "/profiles/fury.simc", iterations: 500}
	input := SimulationInput{Spec: "fury-warrior", Scenario: "aoe", FightLengthSeconds: 120, Targets: 3, Rules: []string{"odyns-fury", "raging-blow"}}
	args := engine.arguments(input, "/tmp/report.json", "/profiles/fury.simc")
	joined := strings.Join(args, "\n")
	for _, expected := range []string{"/profiles/fury.simc", "desired_targets=3", "fight_style=Patchwerk", "json=/tmp/report.json,version=2,full_states=1"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("missing argument %q in %q", expected, joined)
		}
	}
	for _, expected := range []string{"default_actions=0", "actions+=/odyns_fury", "actions+=/raging_blow"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("custom priority argument %q missing from %q", expected, joined)
		}
	}
}

func TestSimCArgumentsSerializeTypedConditions(t *testing.T) {
	engine := &SimCEngine{iterations: 10}
	input := SimulationInput{
		Spec: "fury-warrior", Scenario: "aoe", FightLengthSeconds: 60, Targets: 3,
		Rules: []string{"rampage", "bloodthirst", "execute"},
		APLRules: []APLRule{
			{ID: "rule-rampage", AbilityID: "rampage", Source: "custom", Conditions: []APLCondition{{Type: "resource", Resource: "rage", Operator: "gte", Value: 80}, {Type: "targets", Operator: "gte", Value: 3}}},
			{ID: "rule-bloodthirst", AbilityID: "bloodthirst", Source: "custom", Conditions: []APLCondition{{Type: "buff", Aura: "enrage", State: "down"}}},
			{ID: "rule-execute", AbilityID: "execute", Source: "custom", Conditions: []APLCondition{{Type: "execute", Operator: "lte", Value: 20}}},
		},
	}
	joined := strings.Join(engine.arguments(input, "/tmp/report.json", "/tmp/profile.simc"), "\n")
	for _, expected := range []string{"actions+=/rampage,if=rage>=80&active_enemies>=3", "actions+=/bloodthirst,if=buff.enrage.down", "actions+=/execute,if=target.health.pct<=20"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("typed APL is missing %q in %q", expected, joined)
		}
	}
}

func TestSimCArgumentsChooseActorAppropriateAutoAction(t *testing.T) {
	engine := &SimCEngine{iterations: 1}
	tests := []struct {
		spec string
		want string
		not  string
	}{
		{spec: "arms-warrior", want: "actions=auto_attack"},
		{spec: "beast-mastery-hunter", want: "actions=auto_shot", not: "actions=auto_attack"},
		{spec: "fire-mage", want: "actions=example", not: "actions=auto_attack"},
	}
	for _, test := range tests {
		joined := strings.Join(engine.arguments(SimulationInput{Spec: test.spec, Rules: []string{"example"}}, "/tmp/report.json", "/tmp/profile.simc"), "\n")
		if !strings.Contains(joined, test.want) || test.not != "" && strings.Contains(joined, test.not) {
			t.Fatalf("%s arguments mismatch: %s", test.spec, joined)
		}
	}
}

func TestSimCArgumentsApplyTalentLoadoutOverride(t *testing.T) {
	engine := &SimCEngine{profile: "/profiles/fury.simc", iterations: 500}
	loadout := "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM"
	input := SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 120, Targets: 1, Rules: []string{"rampage"}, TalentLoadout: loadout}
	joined := strings.Join(engine.arguments(input, "/tmp/report.json", "/profiles/fury.simc"), "\n")
	if !strings.Contains(joined, "talents="+loadout) {
		t.Fatalf("talent loadout override missing from arguments")
	}
}

func TestSimCArgumentsUseUserPriorityAsCustomAPL(t *testing.T) {
	engine := &SimCEngine{profile: "/profiles/fury.simc", iterations: 500}
	input := SimulationInput{Spec: "fury-warrior", Scenario: "aoe", FightLengthSeconds: 120, Targets: 5, Rules: []string{"rampage", "bloodthirst", "whirlwind"}}
	joined := strings.Join(engine.arguments(input, "/tmp/report.json", "/profiles/fury.simc"), "\n")
	for _, expected := range []string{"default_actions=0", "actions=auto_attack", "actions+=/rampage", "actions+=/bloodthirst", "actions+=/whirlwind"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("custom APL is missing %q in %q", expected, joined)
		}
	}
}

func TestRotationPresetUsesRealProfileActions(t *testing.T) {
	tempDir := t.TempDir()
	profile := strings.Join([]string{
		"actions.precombat=battle_stance,toggle=on",
		"actions=auto_attack",
		"actions+=/call_action_list,name=slayer_st",
		"actions.slayer_aoe=cleave",
		"actions.slayer_aoe+=/mortal_strike",
		"actions.slayer_st=mortal_strike",
		"actions.slayer_st+=/overpower,if=charges=2",
		"actions.slayer_st+=/execute,if=target.health.pct<=20",
		"actions.slayer_st+=/slam",
	}, "\n")
	if err := os.WriteFile(filepath.Join(tempDir, "MID2_Warrior_Arms.simc"), []byte(profile), 0o600); err != nil {
		t.Fatal(err)
	}
	engine := &SimCEngine{profileDir: tempDir}
	preset, err := engine.RotationPreset("arms-warrior", "ru_RU")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(preset.DefaultRules, ",") != "mortal-strike,overpower,execute,slam,cleave" {
		t.Fatalf("unexpected rules: %#v", preset.DefaultRules)
	}
	if preset.APLSource.Kind != "simulationcraft-maintained" || preset.APLSource.Profile != "MID2_Warrior_Arms.simc" || len(preset.DefaultAPLRules) != len(preset.DefaultRules) {
		t.Fatalf("maintained APL provenance was lost: %#v", preset)
	}
	if got := serializeAPLRule(preset.DefaultAPLRules[2]); got != "execute,if=target.health.pct<=20" {
		t.Fatalf("maintained condition did not round-trip: %q", got)
	}
	for _, rule := range preset.DefaultRules {
		if strings.HasPrefix(rule, "spell-") {
			t.Fatalf("catalog spell placeholder leaked into SimC preset: %q", rule)
		}
	}
}

func TestRotationPresetUsesVerifiedGeneratedActionsWhenMID2ProfileIsMissing(t *testing.T) {
	engine := &SimCEngine{}
	for _, slug := range []string{"balance-druid", "feral-druid", "guardian-druid", "devastation-evoker", "augmentation-evoker"} {
		preset, err := engine.RotationPreset(slug, "en_US")
		if err != nil {
			t.Fatalf("%s: %v", slug, err)
		}
		if len(preset.DefaultRules) < 5 {
			t.Fatalf("%s generated rules are incomplete: %#v", slug, preset.DefaultRules)
		}
	}
}

func TestResultFromSimCDescribesCustomPriorityTruthfully(t *testing.T) {
	var report simcReport
	report.Version = "1210-01"
	report.Sim.Options.Iterations = 1
	player := simcPlayer{}
	player.CollectedData.DPS.Mean = 100000
	player.CollectedData.TotalIterations = 1
	report.Sim.Players = []simcPlayer{player}
	result, err := resultFromSimC(SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 60, Targets: 1, Rules: []string{"bloodthirst", "rampage"}}, report, 100000)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.ModelNotice, "user-configured action priority list") || strings.Contains(result.ModelNotice, "default action priority list") {
		t.Fatalf("misleading model notice: %q", result.ModelNotice)
	}
}

type fakeSimulationEngine struct {
	result SimulationResult
	err    error
}

func (f fakeSimulationEngine) Simulate(context.Context, SimulationInput) (SimulationResult, error) {
	return f.result, f.err
}

func TestWorkerHandlerReturnsEngineAttribution(t *testing.T) {
	mux := http.NewServeMux()
	NewWorkerHandler(fakeSimulationEngine{result: SimulationResult{Status: "completed", Engine: "SimulationCraft 1210-01"}}).Register(mux)
	body := `{"spec":"fury-warrior","scenario":"single-target","fightLengthSeconds":60,"targets":1,"rules":["rampage"]}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(body)))
	if response.Code != http.StatusCreated || response.Header().Get("X-Gildra-Engine") != "simulationcraft" {
		t.Fatalf("status=%d engine=%q", response.Code, response.Header().Get("X-Gildra-Engine"))
	}
}

func TestWorkerHandlerMarksBusyResponseRetryable(t *testing.T) {
	mux := http.NewServeMux()
	NewWorkerHandler(fakeSimulationEngine{err: ErrSimulationBusy}).Register(mux)
	body := `{"spec":"fury-warrior","scenario":"single-target","fightLengthSeconds":60,"targets":1,"rules":["rampage"]}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(body)))
	if response.Code != http.StatusServiceUnavailable || response.Header().Get("Retry-After") != "1" {
		t.Fatalf("status=%d retry-after=%q", response.Code, response.Header().Get("Retry-After"))
	}
}

func TestWorkerHandlerExplainsUnsupportedCombatModel(t *testing.T) {
	mux := http.NewServeMux()
	NewWorkerHandler(fakeSimulationEngine{err: ErrUnsupportedCombatModel}).Register(mux)
	body := `{"spec":"restoration-shaman","scenario":"single-target","fightLengthSeconds":60,"targets":1,"rules":["healing-wave"]}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(body)))
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
}

func TestSimCCastsPreservesPlaybackTraceDensity(t *testing.T) {
	sequence := make([]simcAction, 600)
	for index := range sequence {
		sequence[index] = simcAction{Time: float64(index) / 2, Name: "rampage"}
	}
	casts := simcCasts(sequence, 300, nil)
	if len(casts) != 360 {
		t.Fatalf("timeline casts=%d, want 360", len(casts))
	}
	if casts[0].Time != 0 || casts[len(casts)-1].Time != 299.5 {
		t.Fatalf("sampling lost timeline endpoints: first=%v last=%v", casts[0].Time, casts[len(casts)-1].Time)
	}
}
