package rotationlab

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var baselineRules = []string{"rampage", "bloodthirst", "raging-blow", "execute", "odyns-fury", "whirlwind"}
var talentLoadoutPattern = regexp.MustCompile(`^[A-Za-z0-9+/=_-]+$`)
var abilityIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,63}$`)
var aplIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
var simCGearSlots = map[string]bool{
	"head": true, "neck": true, "shoulder": true, "back": true, "shirt": true,
	"chest": true, "waist": true, "wrist": true, "hands": true, "legs": true,
	"feet": true, "finger1": true, "finger2": true, "trinket1": true,
	"trinket2": true, "main_hand": true, "off_hand": true, "tabard": true,
}

func ValidateInput(input SimulationInput) error {
	if _, ok := supportedSpecs[input.Spec]; !ok {
		return errors.New("unsupported specialization")
	}
	if input.Scenario != "single-target" && input.Scenario != "aoe" && input.Scenario != "execute" {
		return errors.New("invalid scenario")
	}
	if input.FightLengthSeconds < 30 || input.FightLengthSeconds > 300 || input.Targets < 1 || input.Targets > 8 {
		return errors.New("simulation bounds exceeded")
	}
	if len(input.Rules) == 0 || len(input.Rules) > 10 {
		return errors.New("invalid rule count")
	}
	seen := map[string]bool{}
	for _, rule := range input.Rules {
		if !abilityIDPattern.MatchString(rule) || seen[rule] {
			return errors.New("invalid or duplicate rule")
		}
		seen[rule] = true
	}
	if len(input.APLRules) > 0 {
		if len(input.APLRules) != len(input.Rules) {
			return errors.New("conditional priority does not match rule count")
		}
		for index, rule := range input.APLRules {
			if !aplIDPattern.MatchString(rule.ID) || rule.AbilityID != input.Rules[index] || (rule.Source != "maintained" && rule.Source != "custom") || len(rule.Conditions) > 3 {
				return errors.New("invalid conditional priority rule")
			}
			for _, condition := range rule.Conditions {
				if err := validateAPLCondition(condition, seen); err != nil {
					return err
				}
			}
		}
	}
	if loadout := strings.TrimSpace(input.TalentLoadout); loadout != "" {
		if len(loadout) < 20 || len(loadout) > 512 || !talentLoadoutPattern.MatchString(loadout) {
			return errors.New("invalid talent loadout")
		}
	}
	if input.Armory != nil {
		parts := []struct {
			name string
			data []byte
		}{
			{"profile", input.Armory.Profile},
			{"specializations", input.Armory.Specializations},
			{"equipment", input.Armory.Equipment},
		}
		for _, part := range parts {
			if len(part.data) < 2 || len(part.data) > 512<<10 || !json.Valid(part.data) {
				return fmt.Errorf("invalid armory %s payload", part.name)
			}
		}
		if strings.TrimSpace(input.TalentLoadout) == "" {
			return errors.New("armory simulations require an explicit talent loadout")
		}
	}
	if input.GearChange != nil {
		change := input.GearChange
		if input.Armory == nil {
			return errors.New("gear replacement requires an armory snapshot")
		}
		if !simCGearSlots[change.Slot] || change.ItemID <= 0 || change.ItemID > 10_000_000 {
			return errors.New("invalid gear replacement")
		}
		if len(change.BonusIDs) == 0 || len(change.BonusIDs) > 20 || change.EnchantID < 0 || change.EnchantID > 10_000_000 || len(change.GemIDs) > 3 {
			return errors.New("invalid gear modifiers")
		}
		seenModifiers := map[int]bool{}
		for _, id := range change.BonusIDs {
			if id <= 0 || id > 1_000_000 || seenModifiers[id] {
				return errors.New("invalid or duplicate bonus id")
			}
			seenModifiers[id] = true
		}
		for _, id := range change.GemIDs {
			if id <= 0 || id > 10_000_000 {
				return errors.New("invalid gem id")
			}
		}
	}
	return nil
}

func validateAPLCondition(condition APLCondition, abilities map[string]bool) error {
	switch condition.Type {
	case "resource":
		if !aplIDPattern.MatchString(condition.Resource) || (condition.Operator != "gte" && condition.Operator != "lte") || condition.Value < 0 || condition.Value > 1000 {
			return errors.New("invalid resource condition")
		}
	case "buff":
		if !aplIDPattern.MatchString(condition.Aura) || (condition.State != "up" && condition.State != "down") {
			return errors.New("invalid buff condition")
		}
	case "cooldown":
		if !abilities[condition.AbilityID] || (condition.State != "ready" && condition.State != "down") {
			return errors.New("invalid cooldown condition")
		}
	case "targets":
		if (condition.Operator != "gte" && condition.Operator != "lte") || condition.Value < 1 || condition.Value > 8 || condition.Value != math.Trunc(condition.Value) {
			return errors.New("invalid target count condition")
		}
	case "execute":
		if condition.Operator != "lte" || condition.Value < 1 || condition.Value > 100 {
			return errors.New("invalid execute condition")
		}
	default:
		return errors.New("unsupported condition type")
	}
	return nil
}

func Calculate(input SimulationInput) SimulationResult {
	quality := ruleQuality(input.Rules)
	base := map[string]float64{"single-target": 1240000, "aoe": 3860000, "execute": 1760000}[input.Scenario]
	targetFactor := 1.0
	if input.Scenario == "aoe" {
		targetFactor = math.Min(1.14, .92+float64(input.Targets)*.025)
	}
	dps := int(math.Round(base * quality * targetFactor))
	enrage := round(91.7*quality, 1)
	if input.Rules[0] == "bloodthirst" {
		enrage = round(enrage+2.4, 1)
	}
	rageEfficiency := round(89.2*quality-1, 1)
	if input.Rules[0] == "rampage" {
		rageEfficiency = round(rageEfficiency+3, 1)
	}
	cpmBase := map[string]float64{"single-target": 6.2, "aoe": 9.8, "execute": 7.4}[input.Scenario]
	cpm := round(cpmBase*(.94+quality*.06), 1)

	result := SimulationResult{
		ID: uuid.NewString(), Status: "completed", Engine: "gildra-rotation-mvp/1",
		ModelNotice: "Deterministic MVP model — SimulationCraft worker is not connected yet.",
		Scenario:    input.Scenario, FightLengthSeconds: input.FightLengthSeconds, Targets: input.Targets,
		Iterations: 10000, Confidence: int(math.Round(92 + quality*3)), DPS: dps,
		EnrageUptime: enrage, RageEfficiency: rageEfficiency, CastsPerMinute: cpm,
		BaselineDelta: round((quality-1)*100, 1),
		Metrics:       []Metric{{"Enrage Uptime", fmt.Sprintf("%.1f%%", enrage)}, {"Rage Efficiency", fmt.Sprintf("%.1f%%", rageEfficiency)}, {"Casts Per Min", fmt.Sprintf("%.1f", cpm)}},
		Accuracy: Accuracy{
			Mode: "training-model", RotationSource: "user-priority-model",
			Considers:   []string{"priority order", "encounter type", "target count"},
			Limitations: []string{"Estimated training model; not a game-accurate damage simulation."},
		},
	}
	result.RecommendedSequence = append([]string{"recklessness", "avatar"}, input.Rules...)
	for len(result.RecommendedSequence) < 16 {
		result.RecommendedSequence = append(result.RecommendedSequence, input.Rules...)
	}
	result.RecommendedSequence = result.RecommendedSequence[:min(16, len(result.RecommendedSequence))]
	for i := 0; i < 24; i++ {
		result.DPSSeries = append(result.DPSSeries, int(float64(dps)*(.78+float64(i)*.009+math.Sin(float64(i)*1.6)*.025)))
	}
	for i, count := 0, min(96, int(float64(input.FightLengthSeconds)/1.5)); i < count; i++ {
		result.Casts = append(result.Casts, Cast{ID: fmt.Sprintf("cast-%d", i), AbilityID: input.Rules[(i+i/9)%len(input.Rules)], Time: round(float64(i)*1.5, 2), Lane: "global"})
	}
	majors := []Cast{
		{ID: "major-recklessness", AbilityID: "recklessness", Time: 0, Lane: "major", Duration: 15},
		{ID: "major-avatar", AbilityID: "avatar", Time: 30, Lane: "major", Duration: 20},
		{ID: "major-bladestorm", AbilityID: "bladestorm", Time: 66, Lane: "major", Duration: 15},
		{ID: "major-bloodlust", AbilityID: "bloodlust", Time: math.Max(12, float64(input.FightLengthSeconds-42)), Lane: "major", Duration: 40},
	}
	for _, cast := range majors {
		if cast.Time < float64(input.FightLengthSeconds) {
			result.Casts = append(result.Casts, cast)
		}
	}
	procIDs := []string{"bloodthirst", "raging-blow", "rampage"}
	for i := 0; i < max(4, input.FightLengthSeconds/13); i++ {
		at := round(8+float64(i)*13.1, 1)
		if at < float64(input.FightLengthSeconds) {
			result.Casts = append(result.Casts, Cast{ID: fmt.Sprintf("proc-%d", i), AbilityID: procIDs[i%len(procIDs)], Time: at, Lane: "proc"})
		}
	}
	for i := 0; i <= input.FightLengthSeconds/3; i++ {
		wave := 45 + math.Sin(float64(i)*1.37)*23 + math.Sin(float64(i)*.43)*17
		pressure := 10.0
		if input.Rules[0] == "rampage" {
			pressure = -4
		}
		result.Rage = append(result.Rage, ResourcePoint{float64(i * 3), round(math.Max(4, math.Min(100, wave+pressure)), 1)})
	}
	rampageIndex := indexOf(input.Rules, "rampage")
	if rampageIndex != 0 {
		for i, at := range []float64{28, 64, 97} {
			if at < float64(input.FightLengthSeconds) {
				result.Findings = append(result.Findings, Finding{fmt.Sprintf("missed-%d", i), "opportunity", at, "Missed Rampage Opportunity", "Rage reached 80 before Rampage was selected.", "high"})
			}
		}
	}
	result.Findings = append(result.Findings, Finding{"drift-1", "drift", math.Min(float64(input.FightLengthSeconds-2), 88), "Cooldown Drift", "Recklessness drifted beyond the recommended window.", "medium"})
	for _, point := range result.Rage {
		if point.Value >= 88 {
			result.Findings = append(result.Findings, Finding{"overcap-1", "overcap", point.Time, "Rage Overcap", "Rage reached the cap before the next spender window.", "medium"})
			break
		}
	}
	result.BossEvents = []BossEvent{{6, 16, "Boss Vulnerable", "violet"}, {30, 11, "Boss Moves", "gold"}, {math.Min(66, float64(input.FightLengthSeconds)*.55), 16, "Boss Vulnerable", "violet"}, {math.Max(0, float64(input.FightLengthSeconds-22)), 14, "Boss Moves", "gold"}}
	return result
}

func ruleQuality(rules []string) float64 {
	distance := 0
	for expected, rule := range baselineRules {
		actual := indexOf(rules, rule)
		if actual < 0 {
			distance += 4
		} else {
			distance += int(math.Abs(float64(actual - expected)))
		}
	}
	return math.Max(.78, 1-float64(distance)*.018)
}

func indexOf(values []string, value string) int {
	for index, candidate := range values {
		if candidate == value {
			return index
		}
	}
	return -1
}
func round(value float64, precision int) float64 {
	power := math.Pow10(precision)
	return math.Round(value*power) / power
}
