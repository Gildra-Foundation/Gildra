// Package gamecontentcollect collects source facts and pending-review candidates.
// It never prepares, approves, or publishes a public gamecontent release.
package gamecontentcollect

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/gamecontent"
)

const QueueName = "game_content_collect"
const AdapterVersion = "raiderio-static/v1"

type Target struct {
	Context  gamecontent.Context `json:"context"`
	ModuleID string              `json:"moduleId"`
}

func (t Target) Key() string { return t.Context.Key() + "/" + t.ModuleID }
func (t Target) Validate() error {
	if t.Context.Validate() != nil || t.Context.Edition != "retail" || t.Context.Channel != "live" || t.Context.Region != "global" || t.Context.ProgressionKind != "none" || (t.ModuleID != "raids" && t.ModuleID != "mythic-plus") {
		return errors.New("unsupported collection context or module")
	}
	return nil
}
func Targets() []Target {
	c := gamecontent.Context{Game: "wow", Edition: "retail", Channel: "live", Region: "global", ProgressionKind: "none"}
	return []Target{{c, "raids"}, {c, "mythic-plus"}}
}
func sourceURL(t Target) string {
	module := "raiding"
	if t.ModuleID == "mythic-plus" {
		module = "mythic-plus"
	}
	return "https://raider.io/api/v1/" + module + "/static-data?expansion_id=11"
}
func hash(raw []byte) string     { s := sha256.Sum256(raw); return hex.EncodeToString(s[:]) }
func canonical(value any) []byte { raw, _ := json.Marshal(value); return raw }

type Failure struct {
	Code       string
	Retryable  bool
	RetryAfter time.Duration
}

func (e *Failure) Error() string { return e.Code }

type Run struct {
	ID             string  `json:"id"`
	TargetKey      string  `json:"targetKey"`
	RunKey         string  `json:"runKey"`
	Status         string  `json:"status"`
	Attempt        int     `json:"attempt"`
	Fence          int64   `json:"fence"`
	BaseGeneration int64   `json:"baseGeneration"`
	FactsHash      *string `json:"factsHash"`
	ErrorCode      *string `json:"errorCode"`
	Retryable      bool    `json:"retryable"`
}

// IDs are explicitly scoped to Raider.IO expansion 11. They are neither
// Blizzard journal IDs nor inferred from translated names. Tier 1 is an
// aggregate upstream group; encounter mappings preserve its three raids.
var raidGroups = map[int][]string{
	16340: {"the-voidspire", "the-dreamrift", "march-on-queldanas"},
	8062:  {"sporefall"}, 16915: {"venomous-abyss"},
}
var encounterMapping = map[int][2]string{
	197132: {"the-voidspire", "imperator-averzian"}, 197133: {"the-voidspire", "vorasius"},
	197134: {"the-voidspire", "fallen-king-salhadaar"}, 197135: {"the-voidspire", "vaelgor-ezzorak"},
	197136: {"the-voidspire", "lightblinded-vanguard"}, 197137: {"the-voidspire", "crown-of-the-cosmos"},
	197138: {"the-dreamrift", "chimaerus"}, 197139: {"march-on-queldanas", "beloren"},
	197140: {"march-on-queldanas", "midnight-falls"}, 197162: {"sporefall", "rotmire"},
	197163: {"venomous-abyss", "nekzali-the-soulcoiler"}, 197164: {"venomous-abyss", "entombed-sentinels"},
	197166: {"venomous-abyss", "the-lost-explorers"}, 197165: {"venomous-abyss", "vashnik-the-malignant"},
	197167: {"venomous-abyss", "sszorak"}, 197168: {"venomous-abyss", "the-twin-fangs"},
	197169: {"venomous-abyss", "the-coiled-altar"}, 197170: {"venomous-abyss", "ulatek"},
}
var dungeonMapping = map[int]string{
	16865: "altar-of-fangs", 16368: "den-of-nalorakk", 9526: "kings-rest", 16091: "murder-row",
	14063: "ruby-life-pools", 9527: "temple-of-sethraliss", 16359: "the-blinding-vale", 16425: "voidscar-arena",
}
