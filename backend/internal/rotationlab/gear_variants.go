package rotationlab

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type GearVariantRequest struct {
	Spec           string             `json:"spec"`
	CharacterLevel int                `json:"characterLevel"`
	Variants       []GearVariantInput `json:"variants"`
}
type GearVariantInput struct {
	Key    string     `json:"key"`
	Change GearChange `json:"change"`
}
type GearVariantMetadata struct {
	Key            string             `json:"key"`
	ItemID         int                `json:"itemId"`
	ItemLevel      int                `json:"itemLevel"`
	RequiredLevel  int                `json:"requiredLevel"`
	InventoryType  int                `json:"inventoryType"`
	ItemClassID    int                `json:"itemClassId"`
	ItemSubclassID int                `json:"itemSubclassId"`
	Quality        int                `json:"quality"`
	UniqueEquipped bool               `json:"uniqueEquipped"`
	SetID          int                `json:"setId"`
	Stats          map[string]float64 `json:"stats"`
	Error          string             `json:"error,omitempty"`
}
type GearVariantResponse struct {
	Engine   string                `json:"engine"`
	Variants []GearVariantMetadata `json:"variants"`
}

var variantKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9:_-]{1,160}$`)

func validateVariantRequest(input GearVariantRequest) error {
	if _, ok := supportedSpecs[input.Spec]; !ok || input.CharacterLevel < 1 || input.CharacterLevel > 90 || len(input.Variants) < 1 || len(input.Variants) > 16 {
		return errors.New("invalid variant request")
	}
	seen := map[string]bool{}
	for _, v := range input.Variants {
		if !variantKeyPattern.MatchString(v.Key) || seen[v.Key] {
			return errors.New("invalid variant key")
		}
		seen[v.Key] = true
		check := SimulationInput{Spec: input.Spec, Scenario: "single-target", FightLengthSeconds: 30, Targets: 1, Rules: []string{"variant-probe"}, TalentLoadout: strings.Repeat("A", 30), Armory: &ArmorySnapshot{Profile: json.RawMessage(`{}`), Equipment: json.RawMessage(`{}`), Specializations: json.RawMessage(`{}`)}, GearChange: &v.Change}
		if err := ValidateInput(check); err != nil {
			return err
		}
	}
	return nil
}

// ResolveGearVariants asks the same offline engine used by DPS comparisons to
// resolve actual item stats/requirements. No client-supplied ilvl or stats exist.
func (e *SimCEngine) ResolveGearVariants(ctx context.Context, input GearVariantRequest) (GearVariantResponse, error) {
	if err := validateVariantRequest(input); err != nil {
		return GearVariantResponse{}, err
	}
	select {
	case e.limit <- struct{}{}:
		defer func() { <-e.limit }()
	case <-ctx.Done():
		return GearVariantResponse{}, ctx.Err()
	default:
		return GearVariantResponse{}, ErrSimulationBusy
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	return e.resolveVariantBatch(ctx, input)
}
func (e *SimCEngine) resolveVariantBatch(ctx context.Context, input GearVariantRequest) (GearVariantResponse, error) {
	out, err := e.runVariantBatch(ctx, input)
	if err == nil {
		return out, nil
	}
	if ctx.Err() != nil {
		return GearVariantResponse{}, ctx.Err()
	}
	if errors.Is(err, errVariantMetadataMissing) {
		return GearVariantResponse{}, err
	}
	if !errors.Is(err, errVariantItemRejected) {
		return GearVariantResponse{}, err
	}
	if len(input.Variants) == 1 {
		return GearVariantResponse{Variants: []GearVariantMetadata{{Key: input.Variants[0].Key, ItemID: input.Variants[0].Change.ItemID, Error: "item_resolution_failed"}}}, nil
	}
	mid := len(input.Variants) / 2
	left := input
	left.Variants = input.Variants[:mid]
	right := input
	right.Variants = input.Variants[mid:]
	a, err := e.resolveVariantBatch(ctx, left)
	if err != nil {
		return out, err
	}
	b, err := e.resolveVariantBatch(ctx, right)
	if err != nil {
		return out, err
	}
	if a.Engine != "" && b.Engine != "" && a.Engine != b.Engine {
		return out, errors.New("simulation_version_changed")
	}
	if a.Engine == "" {
		a.Engine = b.Engine
	}
	a.Variants = append(a.Variants, b.Variants...)
	return a, nil
}

var errVariantMetadataMissing = errors.New("variant_metadata_worker_upgrade_required")
var errVariantItemRejected = errors.New("variant_item_rejected")

func (e *SimCEngine) runVariantBatch(ctx context.Context, input GearVariantRequest) (GearVariantResponse, error) {
	dir, err := os.MkdirTemp("", "gildra-item-resolve-")
	if err != nil {
		return GearVariantResponse{}, err
	}
	defer os.RemoveAll(dir)
	ref := supportedSpecs[input.Spec]
	var profile strings.Builder
	for i, v := range input.Variants {
		fmt.Fprintf(&profile, "%s=gildra_variant_%d\nspec=%s\nlevel=%d\nrace=%s\nrole=attack\nload_default_gear=1\nactions=wait,sec=1\n%s\n", ref.Class, i, ref.Spec, input.CharacterLevel, ref.Race, serializeGearChange(v.Change))
	}
	path := filepath.Join(dir, "items.simc")
	report := filepath.Join(dir, "items.json")
	if err = os.WriteFile(path, []byte(profile.String()), 0600); err != nil {
		return GearVariantResponse{}, err
	}
	cmd := exec.CommandContext(ctx, e.binary, path, "iterations=1", "threads=1", "max_time=1", "fixed_time=1", "vary_combat_length=0", "optimal_raid=0", "desired_targets=1", "report_details=1", "json2="+report)
	cmd.Dir = dir
	var output bytes.Buffer
	cmd.Stdout = &limitedBuffer{buffer: &output, remaining: maxSimCOutputBytes}
	cmd.Stderr = &limitedBuffer{buffer: &output, remaining: maxSimCOutputBytes}
	if err = cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return GearVariantResponse{}, fmt.Errorf("%w: %v", errVariantItemRejected, err)
		}
		return GearVariantResponse{}, fmt.Errorf("resolve items: %w", err)
	}
	raw, err := os.ReadFile(report)
	if err != nil {
		return GearVariantResponse{}, err
	}
	if len(raw) > 32<<20 {
		return GearVariantResponse{}, errors.New("variant_report_too_large")
	}
	return parseVariantReport(raw, input)
}
func parseVariantReport(raw []byte, input GearVariantRequest) (GearVariantResponse, error) {
	var r struct {
		Version string `json:"version"`
		Git     string `json:"git_revision"`
		Sim     struct {
			Players []struct {
				Name string                                `json:"name"`
				Gear map[string]map[string]json.RawMessage `json:"gear"`
			} `json:"players"`
		} `json:"sim"`
	}
	if err := json.Unmarshal(raw, &r); err != nil {
		return GearVariantResponse{}, err
	}
	response := GearVariantResponse{Engine: "SimulationCraft " + r.Version + " · " + r.Git[:min(7, len(r.Git))], Variants: []GearVariantMetadata{}}
	players := map[string]map[string]map[string]json.RawMessage{}
	for _, p := range r.Sim.Players {
		players[p.Name] = p.Gear
	}
	for i, v := range input.Variants {
		gear := players[fmt.Sprintf("gildra_variant_%d", i)]
		item := gear[v.Change.Slot]
		if item == nil {
			if v.Change.Slot == "wrist" {
				item = gear["wrists"]
			}
			if v.Change.Slot == "shoulder" {
				item = gear["shoulders"]
			}
		}
		result := GearVariantMetadata{Key: v.Key, ItemID: v.Change.ItemID, Stats: map[string]float64{}}
		if item == nil {
			result.Error = "item_has_no_combat_stats"
			response.Variants = append(response.Variants, result)
			continue
		}
		n := func(key string) int { var value int; _ = json.Unmarshal(item[key], &value); return value }
		if n("gildra_metadata_version") != 1 {
			return GearVariantResponse{}, errVariantMetadataMissing
		}
		var tuningKnown bool
		_ = json.Unmarshal(item["content_tuning_known"], &tuningKnown)
		var redirectedKnown bool
		_ = json.Unmarshal(item["redirected_stats_known"], &redirectedKnown)
		result.ItemLevel = n("ilevel")
		result.RequiredLevel = n("required_level")
		result.InventoryType = n("inventory_type")
		result.ItemClassID = n("item_class")
		result.ItemSubclassID = n("item_subclass")
		result.Quality = n("quality")
		result.SetID = n("set_id")
		_ = json.Unmarshal(item["unique_equipped"], &result.UniqueEquipped)
		if n("id") != v.Change.ItemID || n("unknown_bonus_count") > 0 || !tuningKnown || !redirectedKnown || result.ItemLevel < 1 || result.ItemLevel > 1000 || result.RequiredLevel < 0 || result.RequiredLevel > 90 {
			result.Error = "item_variant_unverified"
		}
		// Keep the native report's stat names, including hybrid primary stats.
		for _, key := range []string{"strength", "agility", "intellect", "stamina", "stragi", "agiint", "strint", "stragiint", "crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "armor", "bonus_armor", "leech_rating", "avoidance_rating", "speed_rating"} {
			var value float64
			if json.Unmarshal(item[key], &value) == nil {
				result.Stats[key] = value
			}
		}
		response.Variants = append(response.Variants, result)
	}
	return response, nil
}
func (h *WorkerHandler) resolveVariants(w http.ResponseWriter, r *http.Request) {
	resolver, ok := h.engine.(interface {
		ResolveGearVariants(context.Context, GearVariantRequest) (GearVariantResponse, error)
	})
	if !ok {
		writeProblem(w, 501, "variant_resolution_unavailable", "item variant resolution unavailable")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input GearVariantRequest
	if decoder.Decode(&input) != nil || validateVariantRequest(input) != nil {
		writeProblem(w, 400, "invalid_variant_request", "invalid item variant request")
		return
	}
	result, err := resolver.ResolveGearVariants(r.Context(), input)
	if err != nil {
		code := "variant_resolution_unavailable"
		if errors.Is(err, errVariantMetadataMissing) {
			code = "variant_metadata_worker_upgrade_required"
		}
		writeProblem(w, 503, code, code)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Gildra-Engine", "simulationcraft")
	_ = json.NewEncoder(w).Encode(result)
}
