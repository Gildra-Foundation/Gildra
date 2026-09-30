package rotationlab

import (
	"encoding/json"
	"time"
)

type ArmorySnapshot struct {
	Profile         json.RawMessage `json:"profile"`
	Specializations json.RawMessage `json:"specializations"`
	Equipment       json.RawMessage `json:"equipment"`
}

// GearChange is one explicit, actor-scoped equipment replacement. The worker
// deliberately accepts structured numeric modifiers instead of a raw SimC
// fragment so callers cannot smuggle arbitrary simulator options through it.
type GearChange struct {
	Slot      string `json:"slot"`
	ItemID    int    `json:"itemId"`
	BonusIDs  []int  `json:"bonusIds,omitempty"`
	EnchantID int    `json:"enchantId,omitempty"`
	GemIDs    []int  `json:"gemIds,omitempty"`
}

type SimulationInput struct {
	Spec               string          `json:"spec"`
	Scenario           string          `json:"scenario"`
	FightLengthSeconds int             `json:"fightLengthSeconds"`
	Targets            int             `json:"targets"`
	Rules              []string        `json:"rules"`
	APLRules           []APLRule       `json:"aplRules,omitempty"`
	TalentLoadout      string          `json:"talentLoadout,omitempty"`
	Armory             *ArmorySnapshot `json:"armory,omitempty"`
	GearChange         *GearChange     `json:"gearChange,omitempty"`
	SkipBaseline       bool            `json:"skipBaseline,omitempty"`
}

type APLCondition struct {
	Type      string  `json:"type"`
	Resource  string  `json:"resource,omitempty"`
	Operator  string  `json:"operator,omitempty"`
	Value     float64 `json:"value,omitempty"`
	Aura      string  `json:"aura,omitempty"`
	State     string  `json:"state,omitempty"`
	AbilityID string  `json:"abilityId,omitempty"`
}

type APLRule struct {
	ID         string         `json:"id"`
	AbilityID  string         `json:"abilityId"`
	Conditions []APLCondition `json:"conditions"`
	Source     string         `json:"source"`
}

type APLOptions struct {
	Resources []string `json:"resources"`
	Buffs     []string `json:"buffs"`
	Cooldowns []string `json:"cooldowns"`
}

type APLSource struct {
	Kind    string `json:"kind"`
	Label   string `json:"label"`
	Profile string `json:"profile,omitempty"`
}

type Cast struct {
	ID        string             `json:"id"`
	AbilityID string             `json:"abilityId"`
	Time      float64            `json:"time"`
	Lane      string             `json:"lane"`
	Duration  float64            `json:"duration,omitempty"`
	Resources map[string]float64 `json:"resources,omitempty"`
	Buffs     []string           `json:"buffs,omitempty"`
}

type Ability struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Hint    string `json:"hint"`
	IconURL string `json:"iconUrl"`
	SpellID int    `json:"spellId,omitempty"`
}

type RotationPreset struct {
	Slug           string `json:"slug"`
	ClassName      string `json:"className"`
	Specialization string `json:"specialization"`
	Patch          string `json:"patch"`
	EngineLabel    string `json:"engineLabel"`
	ResourceLabel  string `json:"resourceLabel"`
	Locale         string `json:"locale"`
	Character      struct {
		Name      string `json:"name"`
		Level     int    `json:"level"`
		ItemLevel int    `json:"itemLevel"`
		IconURL   string `json:"iconUrl"`
	} `json:"character"`
	Abilities       []Ability  `json:"abilities"`
	DefaultRules    []string   `json:"defaultRules"`
	DefaultAPLRules []APLRule  `json:"defaultAplRules,omitempty"`
	APLSource       APLSource  `json:"aplSource"`
	APLOptions      APLOptions `json:"aplOptions"`
}

type ResourcePoint struct {
	Time  float64 `json:"time"`
	Value float64 `json:"value"`
}

type ResourceTrack struct {
	Key        string          `json:"key"`
	Label      string          `json:"label"`
	Maximum    float64         `json:"maximum"`
	Average    float64         `json:"average"`
	Minimum    float64         `json:"minimum"`
	Peak       float64         `json:"peak"`
	Efficiency float64         `json:"efficiency"`
	Points     []ResourcePoint `json:"points"`
}

type ProcWindow struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Time     float64 `json:"time"`
	Duration float64 `json:"duration"`
}

type CooldownWindow struct {
	AbilityID       string    `json:"abilityId"`
	Name            string    `json:"name"`
	Uses            []float64 `json:"uses"`
	Duration        float64   `json:"duration,omitempty"`
	AverageInterval float64   `json:"averageInterval,omitempty"`
}

type Accuracy struct {
	Mode           string   `json:"mode"`
	RotationSource string   `json:"rotationSource"`
	Considers      []string `json:"considers"`
	Limitations    []string `json:"limitations"`
}

type Finding struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	Time     float64 `json:"time"`
	Title    string  `json:"title"`
	Detail   string  `json:"detail"`
	Severity string  `json:"severity"`
}

type BossEvent struct {
	Time     float64 `json:"time"`
	Duration float64 `json:"duration"`
	Label    string  `json:"label"`
	Tone     string  `json:"tone"`
}

type Metric struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type SimulatedCombatStats struct {
	Primary     float64 `json:"primary"`
	Crit        float64 `json:"crit"`
	Haste       float64 `json:"haste"`
	Mastery     float64 `json:"mastery"`
	Versatility float64 `json:"versatility"`
}

type SimulationResult struct {
	ID                  string               `json:"id"`
	Status              string               `json:"status"`
	Engine              string               `json:"engine"`
	ModelNotice         string               `json:"modelNotice"`
	ResourceLabel       string               `json:"resourceLabel,omitempty"`
	Scenario            string               `json:"scenario"`
	FightLengthSeconds  int                  `json:"fightLengthSeconds"`
	Targets             int                  `json:"targets"`
	Iterations          int                  `json:"iterations"`
	Confidence          int                  `json:"confidence"`
	DPS                 int                  `json:"dps"`
	DPSError            float64              `json:"dpsError"`
	BaselineIncluded    *bool                `json:"baselineIncluded,omitempty"`
	CombatStats         SimulatedCombatStats `json:"combatStats"`
	DPSSeries           []int                `json:"dpsSeries"`
	EnrageUptime        float64              `json:"enrageUptime"`
	RageEfficiency      float64              `json:"rageEfficiency"`
	CastsPerMinute      float64              `json:"castsPerMinute"`
	BaselineDelta       float64              `json:"baselineDelta"`
	Casts               []Cast               `json:"casts"`
	Abilities           []Ability            `json:"abilities,omitempty"`
	RecommendedSequence []string             `json:"recommendedSequence"`
	Rage                []ResourcePoint      `json:"rage"`
	Resources           []ResourceTrack      `json:"resources,omitempty"`
	Procs               []ProcWindow         `json:"procs,omitempty"`
	Cooldowns           []CooldownWindow     `json:"cooldowns,omitempty"`
	Accuracy            Accuracy             `json:"accuracy"`
	Findings            []Finding            `json:"findings"`
	BossEvents          []BossEvent          `json:"bossEvents"`
	Metrics             []Metric             `json:"metrics"`
	CreatedAt           time.Time            `json:"-"`
}
