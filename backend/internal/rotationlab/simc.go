package rotationlab

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultSimCIterations = 750
	maxSimCOutputBytes    = 2 << 20
)

var (
	ErrSimulationBusy         = errors.New("SimulationCraft worker is busy")
	ErrUnsupportedCombatModel = errors.New("combat model is not supported")
)

type SimulationEngine interface {
	Simulate(context.Context, SimulationInput) (SimulationResult, error)
}

type DeterministicEngine struct{}

func (DeterministicEngine) Simulate(_ context.Context, input SimulationInput) (SimulationResult, error) {
	return Calculate(input), nil
}

type SimCEngine struct {
	binary     string
	profile    string
	profileDir string
	iterations int
	timeout    time.Duration
	limit      chan struct{}
	cacheMu    sync.RWMutex
	baseline   map[string]int
}

func NewSimCEngine(binary, profile string, iterations int) (*SimCEngine, error) {
	if iterations <= 0 || iterations > 10_000 {
		return nil, errors.New("SimulationCraft iterations must be between 1 and 10000")
	}
	if info, err := os.Stat(binary); err != nil || info.IsDir() || info.Mode()&0o111 == 0 {
		return nil, fmt.Errorf("SimulationCraft binary is not executable: %s", binary)
	}
	if profile != "" {
		if info, err := os.Stat(profile); err != nil || info.IsDir() {
			return nil, fmt.Errorf("SimulationCraft profile is not readable: %s", profile)
		}
	}
	profileDir := strings.TrimSpace(os.Getenv("SIMC_PROFILE_DIR"))
	if profileDir == "" && profile != "" {
		profileDir = filepath.Dir(profile)
	}
	return &SimCEngine{
		binary: binary, profile: profile, profileDir: profileDir, iterations: iterations, timeout: 45 * time.Second,
		limit: make(chan struct{}, 1), baseline: make(map[string]int),
	}, nil
}

func EngineFromEnvironment() SimulationEngine {
	binary := strings.TrimSpace(os.Getenv("SIMC_BINARY"))
	profile := strings.TrimSpace(os.Getenv("SIMC_FURY_PROFILE"))
	if binary == "" {
		return DeterministicEngine{}
	}
	iterations := defaultSimCIterations
	if raw := strings.TrimSpace(os.Getenv("SIMC_ITERATIONS")); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil {
			iterations = value
		}
	}
	engine, err := NewSimCEngine(binary, profile, iterations)
	if err != nil {
		return DeterministicEngine{}
	}
	return engine
}

func (e *SimCEngine) Simulate(ctx context.Context, input SimulationInput) (SimulationResult, error) {
	if err := ValidateInput(input); err != nil {
		return SimulationResult{}, err
	}
	if supportedSpecs[input.Spec].Role == "heal" {
		return SimulationResult{}, fmt.Errorf("%w: healer rotations require a dedicated HPS and triage model", ErrUnsupportedCombatModel)
	}
	select {
	case e.limit <- struct{}{}:
		defer func() { <-e.limit }()
	case <-ctx.Done():
		return SimulationResult{}, ctx.Err()
	default:
		return SimulationResult{}, ErrSimulationBusy
	}

	report, err := e.run(ctx, input)
	if err != nil {
		return SimulationResult{}, err
	}
	baselineDPS := int(math.Round(report.Sim.Players[0].CollectedData.DPS.Mean))
	if input.TalentLoadout != "" && input.Armory == nil && !input.SkipBaseline {
		// The comparison baseline must use the same custom priority as the
		// candidate. Otherwise changing rule order can accidentally reuse a
		// talentless baseline produced for a different rotation and corrupt the
		// displayed percentage even though the absolute DPS is correct.
		aplFingerprint, _ := json.Marshal(input.APLRules)
		key := fmt.Sprintf("%s:%s:%d:%d:%s:%s", input.Spec, input.Scenario, input.FightLengthSeconds, input.Targets, strings.Join(input.Rules, ","), aplFingerprint)
		e.cacheMu.RLock()
		baselineDPS = e.baseline[key]
		e.cacheMu.RUnlock()
		if baselineDPS == 0 {
			baselineInput := input
			baselineInput.TalentLoadout = ""
			baselineReport, baselineErr := e.run(ctx, baselineInput)
			if baselineErr != nil {
				return SimulationResult{}, baselineErr
			}
			baselineDPS = int(math.Round(baselineReport.Sim.Players[0].CollectedData.DPS.Mean))
			e.cacheMu.Lock()
			e.baseline[key] = baselineDPS
			e.cacheMu.Unlock()
		}
	}
	return resultFromSimC(input, report, baselineDPS)
}

func (e *SimCEngine) run(ctx context.Context, input SimulationInput) (simcReport, error) {
	runCtx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()
	tempDir, err := os.MkdirTemp("", "gildra-simc-")
	if err != nil {
		return simcReport{}, err
	}
	defer os.RemoveAll(tempDir)
	reportPath := filepath.Join(tempDir, "report.json")
	profilePath, err := e.profileForInput(input, tempDir)
	if err != nil {
		return simcReport{}, err
	}
	args := e.arguments(input, reportPath, profilePath)
	command := exec.CommandContext(runCtx, e.binary, args...)
	command.Dir = filepath.Dir(profilePath)
	var stdout, stderr bytes.Buffer
	command.Stdout = &limitedBuffer{buffer: &stdout, remaining: maxSimCOutputBytes}
	command.Stderr = &limitedBuffer{buffer: &stderr, remaining: maxSimCOutputBytes}
	if err := command.Run(); err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			return simcReport{}, errors.New("SimulationCraft timed out")
		}
		return simcReport{}, fmt.Errorf("SimulationCraft failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	payload, err := os.ReadFile(reportPath)
	if err != nil {
		return simcReport{}, fmt.Errorf("read SimulationCraft report: %w", err)
	}
	var report simcReport
	if err := json.Unmarshal(payload, &report); err != nil {
		return simcReport{}, fmt.Errorf("decode SimulationCraft report: %w", err)
	}
	if len(report.Sim.Players) == 0 || report.Sim.Players[0].CollectedData.DPS.Mean <= 0 {
		return simcReport{}, errors.New("SimulationCraft returned no player DPS")
	}
	return report, nil
}

func (e *SimCEngine) profileForInput(input SimulationInput, tempDir string) (string, error) {
	reference, ok := supportedSpecs[input.Spec]
	if !ok {
		return "", errors.New("unsupported specialization")
	}
	if input.Armory != nil {
		mainPath := filepath.Join(tempDir, "character.json")
		specPath := filepath.Join(tempDir, "specializations.json")
		equipmentPath := filepath.Join(tempDir, "equipment.json")
		for _, file := range []struct {
			path string
			data []byte
		}{{mainPath, input.Armory.Profile}, {specPath, input.Armory.Specializations}, {equipmentPath, input.Armory.Equipment}} {
			if err := os.WriteFile(file.path, file.data, 0o600); err != nil {
				return "", fmt.Errorf("write armory profile: %w", err)
			}
		}
		path := filepath.Join(tempDir, "armory.simc")
		// https://github.com/simulationcraft/simc/wiki/Characters#loading-characters-from-local-json-files
		profile := fmt.Sprintf("local_json=%s,spec=%s,equipment=%s\n", mainPath, specPath, equipmentPath)
		if input.GearChange != nil {
			profile += serializeGearChange(*input.GearChange) + "\n"
		}
		if err := os.WriteFile(path, []byte(profile), 0o600); err != nil {
			return "", fmt.Errorf("write armory SimulationCraft profile: %w", err)
		}
		return path, nil
	}
	if reference.ProfileFile != "" && e.profileDir != "" {
		path := filepath.Join(e.profileDir, reference.ProfileFile)
		if payload, readErr := os.ReadFile(path); readErr == nil {
			// Maintained profiles contain their own named APLs. Keeping those
			// alongside a command-line custom list makes SimC validate unused
			// variables and can fail otherwise valid user priorities. Preserve the
			// actor, talents and gear, but remove every embedded action-list line.
			lines := strings.Split(string(payload), "\n")
			clean := lines[:0]
			for _, line := range lines {
				if strings.HasPrefix(strings.TrimSpace(line), "actions") {
					continue
				}
				clean = append(clean, line)
			}
			sanitized := filepath.Join(tempDir, "reference-profile.simc")
			if err := os.WriteFile(sanitized, []byte(strings.Join(clean, "\n")), 0o600); err != nil {
				return "", fmt.Errorf("write sanitized SimulationCraft profile: %w", err)
			}
			return sanitized, nil
		}
	}
	if input.Spec == "fury-warrior" && e.profile != "" {
		return e.profile, nil
	}
	path := filepath.Join(tempDir, "reference.simc")
	profile := strings.Join([]string{
		"optimal_raid=1",
		"default_actions=1",
		fmt.Sprintf("%s=Gildra_%s", reference.Class, reference.Spec),
		"spec=" + reference.Spec,
		"level=90",
		"race=" + reference.Race,
		"role=" + reference.Role,
		"position=back",
		"load_default_gear=1",
		"class_talents=all",
		"spec_talents=all",
		"hero_talents=1",
		"set_bonus=latest_2pc=1/latest_4pc=1",
	}, "\n") + "\n"
	if err := os.WriteFile(path, []byte(profile), 0o600); err != nil {
		return "", fmt.Errorf("write reference profile: %w", err)
	}
	return path, nil
}

func serializeGearChange(change GearChange) string {
	parts := []string{change.Slot + "=gildra_candidate", "id=" + strconv.Itoa(change.ItemID)}
	if len(change.BonusIDs) > 0 {
		values := make([]string, len(change.BonusIDs))
		for index, id := range change.BonusIDs {
			values[index] = strconv.Itoa(id)
		}
		parts = append(parts, "bonus_id="+strings.Join(values, "/"))
	}
	if change.EnchantID > 0 {
		parts = append(parts, "enchant_id="+strconv.Itoa(change.EnchantID))
	}
	if len(change.GemIDs) > 0 {
		values := make([]string, len(change.GemIDs))
		for index, id := range change.GemIDs {
			values[index] = strconv.Itoa(id)
		}
		parts = append(parts, "gem_id="+strings.Join(values, "/"))
	}
	return strings.Join(parts, ",")
}

var presetIgnoredActions = map[string]bool{
	"auto_attack": true, "charge": true, "potion": true, "pummel": true,
	"auto_shot": true, "retarget": true, "retarget_auto_attack": true,
	"cycling_variable": true, "use_items": true, "stealth": true,
	"wait": true, "pool_resource": true, "cancel_action": true, "cancel_buff": true,
	"counterspell": true, "kick": true, "muzzle": true, "disrupt": true, "rebuke": true,
	"arcane_torrent": true, "lights_judgment": true, "bag_of_tricks": true,
	"berserking": true, "blood_fury": true, "fireblood": true, "ancestral_call": true,
	"invoke_external_buff": true, "use_item": true, "snapshot_stats": true,
	"variable": true, "call_action_list": true, "run_action_list": true,
}

var generatedPresetActions = map[string][]string{
	"balance-druid":       {"moonfire", "sunfire", "wrath", "starfire", "starsurge", "starfall"},
	"feral-druid":         {"rake", "shred", "rip", "ferocious_bite", "thrash"},
	"guardian-druid":      {"mangle", "thrash", "swipe", "maul", "ironfur", "moonfire"},
	"devastation-evoker":  {"living_flame", "disintegrate", "eternity_surge", "fire_breath", "azure_strike", "dragonrage"},
	"augmentation-evoker": {"eruption", "living_flame", "upheaval", "fire_breath", "prescience", "ebon_might"},
}

// RotationPreset extracts real SimulationCraft action names from the maintained
// reference profile. Catalog spell IDs are deliberately not accepted here:
// `spell_12294` is not a SimC action, while `mortal_strike` is.
func (e *SimCEngine) RotationPreset(slug, locale string) (RotationPreset, error) {
	reference, ok := supportedSpecs[slug]
	if !ok {
		return RotationPreset{}, errors.New("maintained SimulationCraft profile is unavailable for this specialization")
	}
	type candidate struct {
		id           string
		singleTarget bool
		conditions   []APLCondition
	}
	candidates := make([]candidate, 0, 32)
	if generated, exists := generatedPresetActions[slug]; exists {
		for _, action := range generated {
			candidates = append(candidates, candidate{id: action, singleTarget: true})
		}
	} else {
		if reference.ProfileFile == "" || e.profileDir == "" {
			return RotationPreset{}, errors.New("maintained SimulationCraft profile is unavailable for this specialization")
		}
		payload, err := os.ReadFile(filepath.Join(e.profileDir, reference.ProfileFile))
		if err != nil {
			return RotationPreset{}, errors.New("maintained SimulationCraft profile is unavailable for this specialization")
		}
		seen := make(map[string]int)
		for _, raw := range strings.Split(string(payload), "\n") {
			line := strings.TrimSpace(raw)
			if !strings.HasPrefix(line, "actions") || !strings.Contains(line, "=") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			listName := strings.TrimSuffix(strings.TrimPrefix(parts[0], "actions."), "+")
			if strings.Contains(listName, "precombat") {
				continue
			}
			payload := strings.TrimPrefix(parts[1], "/")
			action := strings.SplitN(payload, ",", 2)[0]
			action = strings.TrimSpace(action)
			if action == "" || presetIgnoredActions[action] || ignoredSimCActions[action] {
				continue
			}
			isSingleTarget := strings.HasSuffix(listName, "_st") || strings.Contains(listName, "single_target") || listName == "default"
			conditions := parseMaintainedConditions(payload)
			if index, seenBefore := seen[action]; seenBefore {
				if isSingleTarget {
					candidates[index].singleTarget = true
					if len(conditions) > 0 {
						candidates[index].conditions = conditions
					}
				}
				continue
			}
			seen[action] = len(candidates)
			candidates = append(candidates, candidate{id: action, singleTarget: isSingleTarget, conditions: conditions})
		}
	}
	ordered := make([]string, 0, 10)
	for _, preferSingleTarget := range []bool{true, false} {
		for _, entry := range candidates {
			if entry.singleTarget != preferSingleTarget || containsString(ordered, entry.id) {
				continue
			}
			ordered = append(ordered, entry.id)
			if len(ordered) == 10 {
				break
			}
		}
		if len(ordered) == 10 {
			break
		}
	}
	if len(ordered) < 3 {
		return RotationPreset{}, errors.New("maintained profile has no usable action priority list")
	}
	russian := strings.HasPrefix(strings.ToLower(locale), "ru")
	preset := RotationPreset{Slug: slug, ClassName: actionLabel(reference.Class), Specialization: actionLabel(reference.Spec), Patch: "12.1.0", Locale: "en"}
	preset.APLOptions = APLOptions{Resources: []string{}, Buffs: []string{}, Cooldowns: []string{}}
	if russian {
		preset.Locale = "ru"
		preset.EngineLabel = "SimulationCraft · поддерживаемый профиль"
	} else {
		preset.EngineLabel = "SimulationCraft · maintained profile"
	}
	preset.Character.Name = "MID2 Reference"
	preset.Character.Level = 90
	preset.Character.ItemLevel = 339
	preset.APLSource = APLSource{Kind: "simulationcraft-maintained", Label: preset.EngineLabel, Profile: reference.ProfileFile}
	resources, buffs := map[string]bool{}, map[string]bool{}
	if resource := primaryAPLResource(slug, reference); resource != "" {
		resources[resource] = true
	}
	for _, buff := range knownAPLBuffs[slug] {
		buffs[buff] = true
	}
	for _, action := range ordered {
		hint := "SimulationCraft priority action"
		if russian {
			hint = "Действие из поддерживаемой APL SimulationCraft"
		}
		preset.Abilities = append(preset.Abilities, Ability{ID: strings.ReplaceAll(action, "_", "-"), Name: actionLabel(action), Hint: hint})
		appAction := strings.ReplaceAll(action, "_", "-")
		preset.DefaultRules = append(preset.DefaultRules, appAction)
		conditions := []APLCondition{}
		for _, entry := range candidates {
			if entry.id == action {
				for _, condition := range entry.conditions {
					if condition.Type != "cooldown" || containsString(ordered, strings.ReplaceAll(condition.AbilityID, "-", "_")) {
						conditions = append(conditions, condition)
					}
				}
				break
			}
		}
		for _, condition := range conditions {
			if condition.Type == "resource" {
				resources[condition.Resource] = true
			}
			if condition.Type == "buff" {
				buffs[condition.Aura] = true
			}
		}
		preset.DefaultAPLRules = append(preset.DefaultAPLRules, APLRule{ID: fmt.Sprintf("maintained-%d-%s", len(preset.DefaultAPLRules), appAction), AbilityID: appAction, Conditions: conditions, Source: "maintained"})
		preset.APLOptions.Cooldowns = append(preset.APLOptions.Cooldowns, appAction)
	}
	for resource := range resources {
		preset.APLOptions.Resources = append(preset.APLOptions.Resources, resource)
	}
	for buff := range buffs {
		preset.APLOptions.Buffs = append(preset.APLOptions.Buffs, buff)
	}
	sort.Strings(preset.APLOptions.Resources)
	sort.Strings(preset.APLOptions.Buffs)
	return preset, nil
}

var knownAPLBuffs = map[string][]string{
	"fury-warrior": {"enrage", "recklessness", "sudden-death"},
}

func primaryAPLResource(slug string, reference specReference) string {
	switch reference.Class {
	case "warrior":
		return "rage"
	case "deathknight":
		return "runic-power"
	case "demonhunter":
		return "fury"
	case "hunter":
		return "focus"
	case "mage", "priest":
		if slug == "shadow-priest" {
			return "insanity"
		}
		return "mana"
	case "paladin":
		return "holy-power"
	case "rogue":
		return "energy"
	case "shaman":
		return "maelstrom"
	case "warlock":
		return "soul-shard"
	case "evoker":
		return "essence"
	case "monk":
		if slug == "mistweaver-monk" {
			return "mana"
		}
		return "energy"
	case "druid":
		if slug == "balance-druid" {
			return "astral-power"
		}
		if slug == "feral-druid" {
			return "energy"
		}
		if slug == "guardian-druid" {
			return "rage"
		}
		return "mana"
	}
	return ""
}

func parseMaintainedConditions(payload string) []APLCondition {
	parts := strings.Split(payload, ",")
	var expression string
	for _, part := range parts[1:] {
		if strings.HasPrefix(part, "if=") {
			expression = strings.TrimPrefix(part, "if=")
			break
		}
	}
	if expression == "" {
		return []APLCondition{}
	}
	result := make([]APLCondition, 0, 3)
	for _, clause := range strings.Split(expression, "&") {
		if len(result) == 3 {
			return []APLCondition{}
		}
		var condition APLCondition
		switch {
		case strings.HasPrefix(clause, "buff.") && (strings.HasSuffix(clause, ".up") || strings.HasSuffix(clause, ".down")):
			bits := strings.Split(clause, ".")
			if len(bits) != 3 {
				return []APLCondition{}
			}
			condition = APLCondition{Type: "buff", Aura: strings.ReplaceAll(bits[1], "_", "-"), State: bits[2]}
		case strings.HasPrefix(clause, "cooldown.") && (strings.HasSuffix(clause, ".ready") || strings.HasSuffix(clause, ".down")):
			bits := strings.Split(clause, ".")
			if len(bits) != 3 {
				return []APLCondition{}
			}
			condition = APLCondition{Type: "cooldown", AbilityID: strings.ReplaceAll(bits[1], "_", "-"), State: bits[2]}
		case strings.HasPrefix(clause, "active_enemies>=") || strings.HasPrefix(clause, "active_enemies<="):
			condition = numericAPLCondition("targets", clause, "active_enemies")
		case strings.HasPrefix(clause, "target.health.pct<="):
			value, err := strconv.ParseFloat(strings.TrimPrefix(clause, "target.health.pct<="), 64)
			if err != nil {
				return []APLCondition{}
			}
			condition = APLCondition{Type: "execute", Operator: "lte", Value: value}
		default:
			condition = numericAPLCondition("resource", clause, "")
		}
		if condition.Type == "" {
			return []APLCondition{}
		}
		result = append(result, condition)
	}
	return result
}

func numericAPLCondition(kind, clause, prefix string) APLCondition {
	operator, token := "", ""
	if strings.Contains(clause, ">=") {
		operator, token = "gte", ">="
	} else if strings.Contains(clause, "<=") {
		operator, token = "lte", "<="
	}
	if token == "" {
		return APLCondition{}
	}
	parts := strings.SplitN(clause, token, 2)
	value, err := strconv.ParseFloat(parts[1], 64)
	if err != nil {
		return APLCondition{}
	}
	condition := APLCondition{Type: kind, Operator: operator, Value: value}
	if kind == "resource" {
		if parts[0] == "" || strings.Contains(parts[0], ".") {
			return APLCondition{}
		}
		condition.Resource = strings.ReplaceAll(parts[0], "_", "-")
	} else if parts[0] != prefix {
		return APLCondition{}
	}
	return condition
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (e *SimCEngine) arguments(input SimulationInput, reportPath, profilePath string) []string {
	args := []string{
		profilePath,
		fmt.Sprintf("iterations=%d", e.iterations),
		fmt.Sprintf("max_time=%d", input.FightLengthSeconds),
		fmt.Sprintf("desired_targets=%d", input.Targets),
		"vary_combat_length=0", "fixed_time=1", "threads=1", "deterministic=1",
		"calculate_scale_factors=0", "report_details=1", "fight_style=Patchwerk",
		fmt.Sprintf("json=%s,version=2,full_states=1", reportPath),
	}
	if input.TalentLoadout != "" {
		args = append(args, "talents="+input.TalentLoadout)
	}
	// A SimulationCraft action list is a priority list: the engine scans from
	// the first action until it finds one that is currently usable. The UI rules
	// are restricted to registered ability IDs, so they can safely become the
	// actor's custom APL instead of silently falling back to the spec default.
	// Source: https://github.com/simulationcraft/simc/wiki/ActionLists#behaviour
	args = append(args, "default_actions=0")
	hasAutomaticAction := false
	if reference, ok := supportedSpecs[input.Spec]; ok {
		switch {
		case reference.Class == "hunter":
			args = append(args, "actions=auto_shot")
			hasAutomaticAction = true
		case reference.Role == "attack" || reference.Role == "tank":
			args = append(args, "actions=auto_attack")
			hasAutomaticAction = true
		}
	}
	for index, rule := range input.Rules {
		action := strings.ReplaceAll(rule, "-", "_")
		if len(input.APLRules) > 0 {
			action = serializeAPLRule(input.APLRules[index])
		}
		if !hasAutomaticAction && index == 0 {
			args = append(args, "actions="+action)
			continue
		}
		args = append(args, "actions+=/"+action)
	}
	if input.Scenario == "execute" {
		args = append(args, "override.bloodlust=1", "bloodlust_percent=20")
	}
	return args
}

func serializeAPLRule(rule APLRule) string {
	action := strings.ReplaceAll(rule.AbilityID, "-", "_")
	if len(rule.Conditions) == 0 {
		return action
	}
	conditions := make([]string, 0, len(rule.Conditions))
	for _, condition := range rule.Conditions {
		conditions = append(conditions, serializeAPLCondition(condition))
	}
	return action + ",if=" + strings.Join(conditions, "&")
}

func serializeAPLCondition(condition APLCondition) string {
	operator := map[string]string{"gte": ">=", "lte": "<="}[condition.Operator]
	switch condition.Type {
	case "resource":
		return strings.ReplaceAll(condition.Resource, "-", "_") + operator + strconv.FormatFloat(condition.Value, 'f', -1, 64)
	case "buff":
		return "buff." + strings.ReplaceAll(condition.Aura, "-", "_") + "." + condition.State
	case "cooldown":
		return "cooldown." + strings.ReplaceAll(condition.AbilityID, "-", "_") + "." + condition.State
	case "targets":
		return "active_enemies" + operator + strconv.FormatFloat(condition.Value, 'f', -1, 64)
	case "execute":
		return "target.health.pct<=" + strconv.FormatFloat(condition.Value, 'f', -1, 64)
	default:
		return "0"
	}
}

type limitedBuffer struct {
	buffer    *bytes.Buffer
	remaining int
}

func (w *limitedBuffer) Write(payload []byte) (int, error) {
	original := len(payload)
	if w.remaining > 0 {
		chunk := payload
		if len(chunk) > w.remaining {
			chunk = chunk[:w.remaining]
		}
		_, _ = w.buffer.Write(chunk)
		w.remaining -= len(chunk)
	}
	return original, nil
}

type simcSample struct {
	Mean       float64 `json:"mean"`
	Min        float64 `json:"min"`
	Max        float64 `json:"max"`
	MeanStdDev float64 `json:"mean_std_dev"`
}

type simcTimeline struct {
	Data []float64 `json:"data"`
}

type simcCooldownState struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Stacks  int     `json:"stacks"`
	Remains float64 `json:"remains"`
}

type simcAction struct {
	ID           int                `json:"id"`
	SpellID      int                `json:"spell_id"`
	Time         float64            `json:"time"`
	Name         string             `json:"name"`
	Resources    map[string]float64 `json:"resources"`
	ResourcesMax map[string]float64 `json:"resources_max"`
	Buffs        []struct {
		Name  string  `json:"name"`
		Stack float64 `json:"stack"`
	} `json:"buffs"`
	Cooldowns []simcCooldownState `json:"cooldowns"`
}

type simcPlayer struct {
	CollectedData struct {
		FightLength               simcSample              `json:"fight_length"`
		DPS                       simcSample              `json:"dps"`
		TimelineDmg               simcTimeline            `json:"timeline_dmg"`
		TotalIterations           int                     `json:"total_iterations"`
		ResourceLost              map[string]simcSample   `json:"resource_lost"`
		ResourceOverflowed        map[string]simcSample   `json:"resource_overflowed"`
		ResourceTimelines         map[string]simcTimeline `json:"resource_timelines"`
		ExecutedForegroundActions simcSample              `json:"executed_foreground_actions"`
		ActionSequence            []simcAction            `json:"action_sequence"`
		BuffedStats               struct {
			Attribute struct {
				Strength  float64 `json:"strength"`
				Agility   float64 `json:"agility"`
				Intellect float64 `json:"intellect"`
			} `json:"attribute"`
			Stats struct {
				CritPct        float64 `json:"crit_pct"`
				HastePct       float64 `json:"haste_pct"`
				MasteryPct     float64 `json:"mastery_pct"`
				VersatilityPct float64 `json:"versatility_pct"`
			} `json:"stats"`
		} `json:"buffed_stats"`
	} `json:"collected_data"`
	Buffs []struct {
		Name   string  `json:"name"`
		Uptime float64 `json:"uptime"`
	} `json:"buffs"`
	Stats []struct {
		Name        string     `json:"name"`
		NumExecutes simcSample `json:"num_executes"`
	} `json:"stats"`
}

type simcReport struct {
	Version     string `json:"version"`
	GitRevision string `json:"git_revision"`
	Sim         struct {
		Options struct {
			Iterations int     `json:"iterations"`
			Confidence float64 `json:"confidence"`
		} `json:"options"`
		Players []simcPlayer `json:"players"`
	} `json:"sim"`
}

func resultFromSimC(input SimulationInput, report simcReport, baselineDPS int) (SimulationResult, error) {
	if len(report.Sim.Players) == 0 {
		return SimulationResult{}, errors.New("SimulationCraft report has no players")
	}
	player := report.Sim.Players[0]
	result := Calculate(input)
	result.Engine = "SimulationCraft " + report.Version
	if report.GitRevision != "" {
		result.Engine += " · " + report.GitRevision[:min(7, len(report.GitRevision))]
	}
	reference := supportedSpecs[input.Spec]
	profileLabel := "generated reference gear"
	if reference.ProfileFile != "" {
		profileLabel = "maintained MID2 reference profile"
	}
	if input.Armory != nil {
		profileLabel = "character gear imported from the Battle.net Profile API"
	}
	priorityLabel := "user-configured action priority list"
	if input.TalentLoadout != "" {
		result.ModelNotice = "SimulationCraft used the selected talent loadout with the specialization's " + profileLabel + " and " + priorityLabel + "."
	} else {
		result.ModelNotice = "SimulationCraft used the specialization's " + profileLabel + " and " + priorityLabel + "."
	}
	result.DPS = int(math.Round(player.CollectedData.DPS.Mean))
	result.DPSError = round(player.CollectedData.DPS.MeanStdDev, 3)
	baselineIncluded := !input.SkipBaseline
	result.BaselineIncluded = &baselineIncluded
	result.CombatStats = SimulatedCombatStats{
		Primary:     math.Max(player.CollectedData.BuffedStats.Attribute.Strength, math.Max(player.CollectedData.BuffedStats.Attribute.Agility, player.CollectedData.BuffedStats.Attribute.Intellect)),
		Crit:        round(player.CollectedData.BuffedStats.Stats.CritPct*100, 3),
		Haste:       round(player.CollectedData.BuffedStats.Stats.HastePct*100, 3),
		Mastery:     round(player.CollectedData.BuffedStats.Stats.MasteryPct*100, 3),
		Versatility: round(player.CollectedData.BuffedStats.Stats.VersatilityPct*100, 3),
	}
	result.Iterations = player.CollectedData.TotalIterations
	if result.Iterations == 0 {
		result.Iterations = report.Sim.Options.Iterations
	}
	if report.Sim.Options.Confidence > 0 {
		result.Confidence = int(math.Round(report.Sim.Options.Confidence * 100))
	}
	if baselineDPS > 0 {
		result.BaselineDelta = round((float64(result.DPS)/float64(baselineDPS)-1)*100, 1)
	}
	result.DPSSeries = timelineSeries(player.CollectedData.TimelineDmg.Data, result.DPS)
	result.Cooldowns = simcCooldowns(player.CollectedData.ActionSequence, input.FightLengthSeconds)
	result.Abilities = simcAbilities(player.CollectedData.ActionSequence, result.Cooldowns)
	result.Casts = simcCasts(player.CollectedData.ActionSequence, input.FightLengthSeconds, result.Cooldowns)
	result.RecommendedSequence = simcRecommendedSequence(player.CollectedData.ActionSequence, 16, result.Cooldowns)
	result.Resources = simcResources(input.Spec, player, input.FightLengthSeconds)
	if len(result.Resources) > 0 {
		result.ResourceLabel = result.Resources[0].Label
		result.Rage = result.Resources[0].Points
		result.RageEfficiency = result.Resources[0].Efficiency
	}
	result.EnrageUptime = representativeBuffUptime(player, input.Spec)
	result.CastsPerMinute = castsPerMinute(player, input.FightLengthSeconds, result.Cooldowns)
	result.Procs = simcProcs(player.CollectedData.ActionSequence, input.FightLengthSeconds)
	result.Findings = simcFindings(result.Resources, result.Cooldowns, input.FightLengthSeconds)
	result.BossEvents = []BossEvent{}
	resourceMetric := "Resource Efficiency"
	if result.ResourceLabel != "" {
		resourceMetric = result.ResourceLabel + " Efficiency"
	}
	result.Metrics = []Metric{
		{"Key Buff Uptime", fmt.Sprintf("%.1f%%", result.EnrageUptime)},
		{resourceMetric, fmt.Sprintf("%.1f%%", result.RageEfficiency)},
		{"Actions Per Min", fmt.Sprintf("%.1f", result.CastsPerMinute)},
	}
	limitations := []string{"The custom priority uses automatic usability checks; no arbitrary SimulationCraft expressions are accepted."}
	if len(input.APLRules) > 0 {
		limitations[0] = "Per-action resource, buff, cooldown, target-count, and execute conditions were applied by the typed APL editor."
	}
	mode := "simulationcraft-reference"
	if input.Armory != nil {
		mode = "simulationcraft-armory"
		limitations = append(limitations, "Results are a simulation of the latest Battle.net snapshot, not a guarantee of in-game damage.")
	} else {
		limitations = append(limitations, "Damage is for "+profileLabel+", not your Battle.net character.")
	}
	if input.SkipBaseline {
		limitations = append(limitations, "This intermediate optimizer score omits the comparison baseline; use the verified winner result for baseline comparison.")
	}
	if reference.Role == "heal" || input.Spec == "augmentation-evoker" {
		limitations = append(limitations, "Damage alone is not a complete performance metric for healer or support specializations.")
	}
	result.Accuracy = Accuracy{
		Mode: mode, RotationSource: "user-priority-model",
		Considers:   []string{"global cooldown", "ability cooldowns", "resources", "active buffs and procs", "talents", "target count", "execute conditions"},
		Limitations: limitations,
	}
	return result, nil
}

func simcRecommendedSequence(sequence []simcAction, limit int, cooldowns []CooldownWindow) []string {
	result := make([]string, 0, limit)
	for _, action := range sequence {
		if !isUsefulAction(action.Name) || !isObservedCast(action, cooldowns) {
			continue
		}
		result = append(result, actionID(action.Name))
		if len(result) == limit {
			break
		}
	}
	return result
}

var ignoredSimCActions = map[string]bool{
	"snapshot_stats": true, "auto_attack": true, "potion": true, "flask": true,
	"food": true, "augmentation": true, "arcane_intellect": true, "battle_shout": true,
	"mark_of_the_wild": true, "power_word_fortitude": true, "windfury_totem": true,
	"variable": true, "wait": true, "pool_resource": true, "cancel_buff": true,
	"call_action_list": true, "run_action_list": true, "use_item": true,
}

func isUsefulAction(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !ignoredSimCActions[name] && !strings.HasPrefix(name, "use_item_")
}

func actionID(name string) string {
	aliases := map[string]string{"bloodbath": "bloodthirst", "crushing_blow": "raging-blow"}
	if alias := aliases[name]; alias != "" {
		return alias
	}
	return strings.ReplaceAll(strings.TrimSpace(name), "_", "-")
}

func actionLabel(name string) string {
	words := strings.Fields(strings.ReplaceAll(strings.ReplaceAll(name, "_", " "), "-", " "))
	for index, word := range words {
		if word != "" {
			words[index] = strings.ToUpper(word[:1]) + word[1:]
		}
	}
	return strings.Join(words, " ")
}

func simcAbilities(sequence []simcAction, cooldowns []CooldownWindow) []Ability {
	abilities := make([]Ability, 0, 20)
	seen := make(map[string]bool)
	for _, action := range sequence {
		if !isUsefulAction(action.Name) || !isObservedCast(action, cooldowns) {
			continue
		}
		id := actionID(action.Name)
		if seen[id] {
			continue
		}
		seen[id] = true
		spellID := action.SpellID
		if spellID == 0 {
			spellID = action.ID
		}
		abilities = append(abilities, Ability{ID: id, Name: actionLabel(action.Name), Hint: "SimulationCraft action", SpellID: spellID})
		if len(abilities) == 24 {
			break
		}
	}
	return abilities
}

func timelineSeries(values []float64, dps int) []int {
	if len(values) < 2 {
		return Calculate(SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 120, Targets: 1, Rules: baselineRules}).DPSSeries
	}
	count := min(24, len(values))
	series := make([]int, 0, count)
	for index := 0; index < count; index++ {
		source := int(math.Round(float64(index) * float64(len(values)-1) / float64(max(1, count-1))))
		value := values[source]
		if value <= 0 {
			value = float64(dps)
		}
		series = append(series, int(math.Round(value)))
	}
	return series
}

func resourcePoints(values []float64, fightLength int, maximum float64) []ResourcePoint {
	if maximum <= 0 {
		maximum = 100
	}
	step := max(1, (len(values)+79)/80)
	points := make([]ResourcePoint, 0, len(values)/step+1)
	for index := 0; index < len(values); index += step {
		timeAt := float64(index) * float64(fightLength) / float64(max(1, len(values)-1))
		normalized := values[index] / maximum * 100
		points = append(points, ResourcePoint{Time: round(timeAt, 1), Value: round(math.Min(100, math.Max(0, normalized)), 1)})
	}
	return points
}

func simcResources(spec string, player simcPlayer, fightLength int) []ResourceTrack {
	keys := make(map[string]bool)
	for key := range player.CollectedData.ResourceTimelines {
		if usefulResource(key) {
			keys[key] = true
		}
	}
	for _, action := range player.CollectedData.ActionSequence {
		for key := range action.Resources {
			if usefulResource(key) {
				keys[key] = true
			}
		}
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	preferred := preferredResources(spec)
	sort.SliceStable(ordered, func(left, right int) bool {
		leftRank, rightRank := indexOf(preferred, ordered[left]), indexOf(preferred, ordered[right])
		if leftRank < 0 {
			leftRank = 100
		}
		if rightRank < 0 {
			rightRank = 100
		}
		if leftRank == rightRank {
			return ordered[left] < ordered[right]
		}
		return leftRank < rightRank
	})

	tracks := make([]ResourceTrack, 0, len(ordered))
	for _, key := range ordered {
		maximum := resourceMaximum(player.CollectedData.ActionSequence, key)
		values := append([]float64(nil), player.CollectedData.ResourceTimelines[key].Data...)
		// SimulationCraft resource timelines use a zero-valued origin sample even
		// for resources that start full (runes, energy, mana). The first full-state
		// action contains the actual pre-action value, so use it for t=0 instead of
		// showing a misleading empty bar before the opener.
		if len(values) > 0 {
			if initial, ok := initialResourceValue(player.CollectedData.ActionSequence, key); ok {
				values[0] = initial
			}
		}
		points := resourcePoints(values, fightLength, maximum)
		if len(values) == 0 {
			points, values = actionResourcePoints(player.CollectedData.ActionSequence, key, maximum)
		}
		if len(values) == 0 {
			continue
		}
		minimum, peak, sum := values[0], values[0], 0.0
		for _, value := range values {
			minimum = math.Min(minimum, value)
			peak = math.Max(peak, value)
			sum += value
		}
		efficiency := 100.0
		lost := player.CollectedData.ResourceLost[key].Mean
		overflowed := player.CollectedData.ResourceOverflowed[key].Mean
		if lost > 0 && overflowed > 0 {
			efficiency = math.Max(0, 100-overflowed/lost*100)
		}
		tracks = append(tracks, ResourceTrack{
			Key: key, Label: actionLabel(key), Maximum: round(maximum, 1), Average: round(sum/float64(len(values)), 1),
			Minimum: round(minimum, 1), Peak: round(peak, 1), Efficiency: round(efficiency, 1), Points: points,
		})
		if len(tracks) == 4 {
			break
		}
	}
	return tracks
}

func initialResourceValue(sequence []simcAction, key string) (float64, bool) {
	for _, action := range sequence {
		if action.Time < 0 {
			continue
		}
		if value, ok := action.Resources[key]; ok {
			return value, true
		}
	}
	return 0, false
}

func usefulResource(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	return key != "" && key != "health" && key != "none"
}

func preferredResources(spec string) []string {
	switch {
	case strings.Contains(spec, "death-knight"):
		return []string{"runic_power", "rune"}
	case strings.Contains(spec, "rogue"):
		return []string{"energy", "combo_point", "combo_points"}
	case spec == "feral-druid":
		return []string{"energy", "combo_point", "combo_points"}
	case spec == "guardian-druid", strings.Contains(spec, "warrior"):
		return []string{"rage"}
	case spec == "balance-druid":
		return []string{"astral_power"}
	case strings.Contains(spec, "hunter"):
		return []string{"focus"}
	case strings.Contains(spec, "monk"):
		return []string{"energy", "chi", "mana"}
	case strings.Contains(spec, "paladin"):
		return []string{"holy_power", "mana"}
	case strings.Contains(spec, "warlock"):
		return []string{"soul_shard", "mana"}
	case strings.Contains(spec, "demon-hunter"):
		return []string{"fury"}
	case spec == "shadow-priest":
		return []string{"insanity", "mana"}
	case strings.Contains(spec, "shaman"):
		return []string{"maelstrom", "mana"}
	case strings.Contains(spec, "evoker"):
		return []string{"essence", "mana"}
	default:
		return []string{"mana", "energy", "rage"}
	}
}

func actionResourcePoints(sequence []simcAction, key string, maximum float64) ([]ResourcePoint, []float64) {
	points := make([]ResourcePoint, 0, len(sequence))
	values := make([]float64, 0, len(sequence))
	for _, action := range sequence {
		value, ok := action.Resources[key]
		if !ok {
			continue
		}
		values = append(values, value)
		normalized := value / max(1, maximum) * 100
		points = append(points, ResourcePoint{Time: round(action.Time, 1), Value: round(math.Min(100, math.Max(0, normalized)), 1)})
	}
	return points, values
}

func simcCooldowns(sequence []simcAction, fightLength int) []CooldownWindow {
	type observation struct{ remains, at float64 }
	previous := make(map[string]observation)
	lastAction := make(map[string]float64)
	uses := make(map[string][]float64)
	names := make(map[string]string)
	durations := make(map[string]float64)
	for _, action := range sequence {
		if action.Time < 0 || action.Time > float64(fightLength) {
			continue
		}
		current := make(map[string]observation, len(action.Cooldowns))
		for _, cooldown := range action.Cooldowns {
			if !usefulCooldown(cooldown) {
				continue
			}
			id := actionID(cooldown.Name)
			current[id] = observation{remains: cooldown.Remains, at: action.Time}
			names[id] = actionLabel(cooldown.Name)
			durations[id] = math.Max(durations[id], cooldown.Remains)
			prior, active := previous[id]
			expectedRemain := prior.remains - (action.Time - prior.at)
			if active && cooldown.Remains <= expectedRemain+1 {
				continue
			}
			usedAt := action.Time
			if castAt, ok := lastAction[cooldown.Name]; ok && action.Time-castAt <= 2.5 {
				usedAt = castAt
			}
			usedAt = round(usedAt, 1)
			observed := uses[id]
			if len(observed) == 0 || math.Abs(observed[len(observed)-1]-usedAt) > .12 {
				uses[id] = append(observed, usedAt)
			}
		}
		previous = current
		if isUsefulAction(action.Name) {
			lastAction[action.Name] = action.Time
		}
	}
	cooldowns := make([]CooldownWindow, 0, len(uses))
	for id, observedUses := range uses {
		average := 0.0
		if len(observedUses) > 1 {
			for index := 1; index < len(observedUses); index++ {
				average += observedUses[index] - observedUses[index-1]
			}
			average /= float64(len(observedUses) - 1)
		}
		cooldowns = append(cooldowns, CooldownWindow{AbilityID: id, Name: names[id], Uses: observedUses, Duration: round(durations[id], 1), AverageInterval: round(average, 1)})
	}
	sort.Slice(cooldowns, func(left, right int) bool {
		leftUse, rightUse := cooldowns[left].Uses[0], cooldowns[right].Uses[0]
		if leftUse == rightUse {
			return cooldowns[left].Name < cooldowns[right].Name
		}
		return leftUse < rightUse
	})
	return cooldowns
}

func usefulCooldown(cooldown simcCooldownState) bool {
	name := strings.ToLower(cooldown.Name)
	return cooldown.ID > 0 && cooldown.Remains >= 2 && name != "" &&
		!strings.Contains(name, "_internal") && !strings.HasPrefix(name, "buff_") &&
		!strings.HasPrefix(name, "item_") && !strings.HasPrefix(name, "potion") && name != "global_cooldown"
}

func representativeBuffUptime(player simcPlayer, spec string) float64 {
	if spec == "fury-warrior" {
		if uptime := buffUptime(player, "enrage"); uptime > 0 {
			return uptime
		}
	}
	best := 0.0
	for _, buff := range player.Buffs {
		if buff.Uptime > best && buff.Uptime < 99.9 {
			best = buff.Uptime
		}
	}
	return round(best, 1)
}

func simcProcs(sequence []simcAction, fightLength int) []ProcWindow {
	active := make(map[string]float64)
	windows := make([]ProcWindow, 0, 24)
	for _, action := range sequence {
		if action.Time < 0 || action.Time > float64(fightLength) {
			continue
		}
		current := make(map[string]bool, len(action.Buffs))
		for _, buff := range action.Buffs {
			if buff.Name == "" {
				continue
			}
			current[buff.Name] = true
			if _, ok := active[buff.Name]; !ok {
				active[buff.Name] = action.Time
			}
		}
		for name, started := range active {
			if current[name] {
				continue
			}
			windows = appendProcWindow(windows, name, started, action.Time, fightLength)
			delete(active, name)
		}
	}
	for name, started := range active {
		windows = appendProcWindow(windows, name, started, float64(fightLength), fightLength)
	}
	sort.Slice(windows, func(left, right int) bool { return windows[left].Time < windows[right].Time })
	return windows
}

func appendProcWindow(windows []ProcWindow, name string, started, ended float64, fightLength int) []ProcWindow {
	duration := ended - started
	if duration < .2 || duration >= float64(fightLength)*.9 {
		return windows
	}
	return append(windows, ProcWindow{
		ID: fmt.Sprintf("proc-%s-%d", actionID(name), len(windows)), Name: actionLabel(name),
		Time: round(started, 1), Duration: round(duration, 1),
	})
}

func simcCasts(sequence []simcAction, fightLength int, cooldowns []CooldownWindow) []Cast {
	major := make(map[string]float64, len(cooldowns))
	for _, cooldown := range cooldowns {
		major[cooldown.AbilityID] = cooldown.Duration
	}
	casts := make([]Cast, 0, min(160, len(sequence)))
	for index, action := range sequence {
		if action.Time < 0 || action.Time > float64(fightLength) || !isUsefulAction(action.Name) || !isObservedCast(action, cooldowns) {
			continue
		}
		abilityID := actionID(action.Name)
		lane := "global"
		duration := 0.0
		if cooldownDuration, ok := major[abilityID]; ok {
			lane = "major"
			duration = cooldownDuration
		}
		buffs := make([]string, 0, min(8, len(action.Buffs)))
		for _, buff := range action.Buffs[:min(8, len(action.Buffs))] {
			buffs = append(buffs, actionLabel(buff.Name))
		}
		casts = append(casts, Cast{ID: fmt.Sprintf("simc-cast-%d", index), AbilityID: abilityID, Time: round(action.Time, 2), Lane: lane, Duration: duration, Resources: action.Resources, Buffs: buffs})
	}
	if len(casts) > 360 {
		sampled := append([]Cast(nil), casts[:60]...)
		for index := 0; index < 300; index++ {
			source := 60 + int(math.Round(float64(index)*float64(len(casts)-61)/299))
			sampled = append(sampled, casts[source])
		}
		casts = sampled
	}
	return casts
}

func isObservedCast(action simcAction, cooldowns []CooldownWindow) bool {
	id := actionID(action.Name)
	for _, cooldown := range cooldowns {
		if cooldown.AbilityID != id {
			continue
		}
		for _, usedAt := range cooldown.Uses {
			if math.Abs(usedAt-action.Time) <= .12 {
				return true
			}
		}
		return false
	}
	return true
}

func hasSimCBuff(action simcAction, name string) bool {
	for _, buff := range action.Buffs {
		if buff.Name == name {
			return true
		}
	}
	return false
}

func buffUptime(player simcPlayer, name string) float64 {
	for _, buff := range player.Buffs {
		if buff.Name == name {
			return round(buff.Uptime, 1)
		}
	}
	return 0
}

func resourceMaximum(sequence []simcAction, resource string) float64 {
	for _, action := range sequence {
		if maximum := action.ResourcesMax[resource]; maximum > 0 {
			return maximum
		}
	}
	return 100
}

func castsPerMinute(player simcPlayer, fightLength int, cooldowns []CooldownWindow) float64 {
	if fightLength <= 0 {
		return 0
	}
	casts := 0
	for _, action := range player.CollectedData.ActionSequence {
		if action.Time >= 0 && action.Time <= float64(fightLength) && isUsefulAction(action.Name) && isObservedCast(action, cooldowns) {
			casts++
		}
	}
	return round(float64(casts)/float64(fightLength)*60, 1)
}

func simcFindings(resources []ResourceTrack, cooldowns []CooldownWindow, fightLength int) []Finding {
	findings := make([]Finding, 0, 4)
	for _, resource := range resources {
		if resource.Efficiency >= 99.5 {
			continue
		}
		at := 0.0
		for _, point := range resource.Points {
			if point.Value >= 99.5 {
				at = point.Time
				break
			}
		}
		findings = append(findings, Finding{
			ID: "simc-overcap-" + resource.Key, Kind: "overcap", Time: at,
			Title: resource.Label + " Overflow", Detail: fmt.Sprintf("Observed resource efficiency was %.1f%% in the reference simulation.", resource.Efficiency), Severity: "medium",
		})
		if len(findings) == 2 {
			break
		}
	}
	for _, cooldown := range cooldowns {
		interval := cooldown.Duration
		if interval <= 0 {
			interval = cooldown.AverageInterval
		}
		if interval <= 0 || len(cooldown.Uses) == 0 {
			continue
		}
		last := cooldown.Uses[len(cooldown.Uses)-1]
		if float64(fightLength)-last > interval+5 {
			findings = append(findings, Finding{
				ID: "simc-drift-" + cooldown.AbilityID, Kind: "drift", Time: round(last+interval, 1),
				Title: cooldown.Name + " Window", Detail: "The action became available again before the reference encounter ended.", Severity: "medium",
			})
			break
		}
	}
	return findings
}

func sameRules(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
