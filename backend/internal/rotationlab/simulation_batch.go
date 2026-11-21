package rotationlab

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

const maxSimulationBatch = 25

// SimC excludes its warm-up iteration. Keep one sample for the unused primary row.
const neutralPrimaryIterations = 2

var errUnsupportedMixedSlots = errors.New("mixed-slot batches require a verified SimulationCraft revision")

type batchCandidate struct {
	GearChanges    []GearChange `json:"gearChanges"`
	OwnedChanges   []ownedEdit  `json:"ownedChanges,omitempty"`
	ownedLines     []string
	neutralPrimary bool
}

type simulationBatch struct {
	MixedSlots bool             `json:"mixedSlots,omitempty"`
	Base       SimulationInput  `json:"base"`
	Candidates []batchCandidate `json:"candidates"`
}

type batchMeasurement struct {
	DPS        int     `json:"dps"`
	DPSMean    float64 `json:"dpsMean"`
	DPSError   float64 `json:"dpsError"`
	Iterations int     `json:"iterations"`
	Confidence int     `json:"confidence"`
	Engine     string  `json:"engine"`

	// Measured on this physical build, at this precision and seed.
	EquivalentBootRatings byte `json:"equivalentBootRatingsV1,omitempty"`
	UnreadArmorRatings    byte `json:"unreadArmorRatingsV1,omitempty"`

	furyWithoutLeechHealing bool
}

type batchEngine interface {
	SimulateBatch(context.Context, simulationBatch) ([]batchMeasurement, error)
}

var errInvalidSimulationBatch = errors.New("invalid simulation batch")

func (b simulationBatch) validate() error {
	if len(b.Candidates) < 1 || len(b.Candidates) > maxSimulationBatch {
		return errors.New("invalid batch candidate count")
	}
	if b.Base.ActionListMode != ActionListModeNative ||
		(b.Base.Precision != auctionCandidatePrecision && b.Base.Precision != auctionFinalistPrecision) ||
		b.Base.GearChange != nil || len(b.Base.GearChanges) > 0 {
		return errors.New("expected native auction simulation base without gear overrides")
	}
	if err := ValidateInput(b.Base); err != nil {
		return err
	}
	if b.MixedSlots && (b.Base.Armory == nil || b.Base.Precision != auctionCandidatePrecision) {
		return errors.New("mixed slots require a candidate armory")
	}
	// Homogeneous batches inherit row zero. Mixed batches use an untouched
	// primary actor and give each profileset all its own overrides.
	slots := make(map[string]bool)
	for _, change := range b.Candidates[0].GearChanges {
		slots[change.Slot] = true
	}
	for _, row := range b.Candidates {
		if b.MixedSlots && len(row.OwnedChanges) != 0 {
			return errors.New("mixed slots require purchased candidate gear")
		}
		if len(row.GearChanges)+len(row.OwnedChanges) == 0 || (!b.MixedSlots && len(row.GearChanges) != len(slots)) || len(row.OwnedChanges) != len(b.Candidates[0].OwnedChanges) {
			return errors.New("batch candidates must replace the same slots")
		}
		if err := validateGearChanges(row.GearChanges, true); err != nil {
			return err
		}
		for _, change := range row.GearChanges {
			if !b.MixedSlots && !slots[change.Slot] {
				return errors.New("batch candidates must replace the same slots")
			}
		}
	}
	return nil
}

func (e *SimCEngine) SimulateBatch(ctx context.Context, b simulationBatch) ([]batchMeasurement, error) {
	if err := b.validate(); err != nil {
		return nil, fmt.Errorf("%w: %v", errInvalidSimulationBatch, err)
	}
	if supportedSpecs[b.Base.Spec].Role == "heal" {
		return nil, fmt.Errorf("%w: healer rotations require a dedicated HPS and triage model", ErrUnsupportedCombatModel)
	}
	owned := len(b.Candidates[0].OwnedChanges) > 0
	if owned {
		prepared, err := b.prepareOwnedCandidates()
		if err != nil {
			return nil, err
		}
		b.Candidates = prepared
	}
	if err := e.acquire(ctx); err != nil {
		return nil, err
	}
	defer e.release()
	if owned && len(b.Candidates) > 1 && (b.Base.Spec == "fury-warrior" || b.Base.Spec == "fire-mage") {
		return simulateArmorBatch(b.Candidates, b.Base.Precision == auctionFinalistPrecision, func(candidates []batchCandidate, reads *byte) ([]batchMeasurement, error) {
			subset := b
			subset.Candidates = candidates
			return e.runPreparedBatch(ctx, subset, reads)
		})
	}
	return e.runPreparedBatch(ctx, b, nil)
}

func (e *SimCEngine) runPreparedBatch(ctx context.Context, b simulationBatch, reads *byte) ([]batchMeasurement, error) {
	input := b.Base
	// Mixed rows inherit the original armory. The extra primary measurement
	// is never returned as a candidate or used in its confidence interval.
	candidateIterations := e.iterationBudget(input)
	primaryIterations := candidateIterations
	if b.MixedSlots {
		primaryIterations = neutralPrimaryIterations
		b.Candidates = append([]batchCandidate{{neutralPrimary: true}}, b.Candidates...)
	} else {
		input.GearChanges = b.Candidates[0].GearChanges
	}
	payload, err := e.runReportWithArmorReads(ctx, input, b.Candidates, reads)
	if err != nil {
		return nil, err
	}
	rows, err := parseSimulationBatchBudgets(payload, len(b.Candidates), candidateIterations, primaryIterations)
	if err == nil && b.MixedSlots {
		if !strings.HasSuffix(rows[0].Engine, " · 18428cd") {
			return nil, errUnsupportedMixedSlots
		}
		rows = rows[1:]
	}
	if err == nil && len(b.Candidates[0].OwnedChanges) > 0 && !strings.HasSuffix(rows[0].Engine, " · 18428cd") {
		return nil, errUnsupportedOwnedBatch
	}
	return rows, err
}

func parseSimulationBatch(payload []byte, count, expectedIterations int) ([]batchMeasurement, error) {
	return parseSimulationBatchBudgets(payload, count, expectedIterations, expectedIterations)
}

func parseSimulationBatchBudgets(payload []byte, count, expectedIterations, primaryIterations int) ([]batchMeasurement, error) {
	if count < 1 || count > maxSimulationBatch+1 || expectedIterations < 2 || primaryIterations < 2 {
		return nil, errors.New("invalid SimulationCraft measurement count")
	}
	// The two native JSON schemas use different names for standard error.
	// A missing standard error must never turn into a zero-width interval.
	var report struct {
		Version     string `json:"version"`
		GitRevision string `json:"git_revision"`
		Sim         struct {
			Options struct {
				Confidence float64 `json:"confidence"`
				Iterations int     `json:"iterations"`
			} `json:"options"`
			Players []struct {
				FuryWithoutLeechHealing bool `json:"gildra_fury_without_leech_healing_v1"`
				CollectedData           struct {
					DPS struct {
						Mean  float64  `json:"mean"`
						Error *float64 `json:"mean_std_dev"`
						Count *int     `json:"count"`
					} `json:"dps"`
					TotalIterations int `json:"total_iterations"`
				} `json:"collected_data"`
			} `json:"players"`
			Profilesets struct {
				Metric  string `json:"metric"`
				Results []struct {
					Name       string   `json:"name"`
					Mean       float64  `json:"mean"`
					Error      *float64 `json:"mean_stddev"`
					Iterations int      `json:"iterations"`
				} `json:"results"`
			} `json:"profilesets"`
		} `json:"sim"`
	}
	if err := json.Unmarshal(payload, &report); err != nil {
		return nil, fmt.Errorf("decode SimulationCraft batch report: %w", err)
	}
	sim := report.Sim
	if report.Version == "" || report.GitRevision == "" || len(sim.Players) != 1 || len(sim.Profilesets.Results) != count-1 ||
		sim.Options.Iterations != primaryIterations || sim.Options.Confidence <= 0 || sim.Options.Confidence >= 1 ||
		(count > 1 && sim.Profilesets.Metric != "Damage per Second") {
		return nil, errors.New("incomplete SimulationCraft batch report")
	}
	measurements := make([]batchMeasurement, count)
	engine := nativeEngineLabel(report.Version, report.GitRevision)
	confidence := int(math.Round(sim.Options.Confidence * 100))
	if confidence < 1 || confidence > 99 {
		return nil, errors.New("invalid SimulationCraft confidence")
	}
	add := func(i int, mean float64, standardError *float64, iterations int) error {
		if i < 0 || i >= count || measurements[i].Engine != "" || mean <= 0 ||
			standardError == nil || *standardError < 0 || iterations != expectedIterations {
			return errors.New("invalid SimulationCraft batch measurement")
		}
		measurements[i] = batchMeasurement{DPS: int(math.Round(mean)), DPSMean: mean, DPSError: *standardError, Iterations: iterations, Confidence: confidence, Engine: engine}
		return nil
	}
	base := sim.Players[0].CollectedData
	// The pinned binary excludes its warm-up iteration from sample statistics.
	// Keep the configured iteration budget on the wire, but reject a truncated
	// sample set rather than treating its uncertainty as the requested precision.
	if base.DPS.Count == nil || (*base.DPS.Count != primaryIterations-1 && *base.DPS.Count != primaryIterations) {
		return nil, errors.New("incomplete SimulationCraft DPS samples")
	}
	iterations := base.TotalIterations
	if iterations == 0 {
		iterations = sim.Options.Iterations
	}
	if primaryIterations != expectedIterations {
		// This row only supplies the common armory. An idle primary actor
		// may deal zero damage even when a purchased weapon can attack.
		if iterations != primaryIterations {
			return nil, errors.New("incomplete SimulationCraft primary iterations")
		}
		measurements[0].Engine = engine
	} else if err := add(0, base.DPS.Mean, base.DPS.Error, iterations); err != nil {
		return nil, err
	}
	// Only the primary actor emitted this evidence. Profileset rows contain scores alone.
	measurements[0].furyWithoutLeechHealing = sim.Players[0].FuryWithoutLeechHealing
	for _, row := range sim.Profilesets.Results {
		// SimC sorts by performance. Restore the request order using the exact
		// generated name and reject a duplicate, unknown or missing candidate.
		if len(row.Name) < 2 || row.Name[0] != 'c' {
			return nil, errors.New("invalid SimulationCraft profileset name")
		}
		i, err := strconv.Atoi(row.Name[1:])
		if err != nil || i < 1 || row.Name != "c"+strconv.Itoa(i) {
			return nil, errors.New("invalid SimulationCraft profileset index")
		}
		if err := add(i, row.Mean, row.Error, row.Iterations); err != nil {
			return nil, err
		}
	}
	return measurements, nil
}
