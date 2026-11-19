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

type batchCandidate struct {
	GearChanges  []GearChange `json:"gearChanges"`
	OwnedChanges []ownedEdit  `json:"ownedChanges,omitempty"`
	ownedLines   []string
}

type simulationBatch struct {
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
	// Profilesets inherit the first candidate's overrides. Every row must
	// replace that complete set or it could silently retain another row's gear.
	slots := make(map[string]bool)
	for _, change := range b.Candidates[0].GearChanges {
		slots[change.Slot] = true
	}
	for _, row := range b.Candidates {
		if len(row.GearChanges)+len(row.OwnedChanges) == 0 || len(row.GearChanges) != len(slots) || len(row.OwnedChanges) != len(b.Candidates[0].OwnedChanges) {
			return errors.New("batch candidates must replace the same slots")
		}
		if err := validateGearChanges(row.GearChanges, true); err != nil {
			return err
		}
		for _, change := range row.GearChanges {
			if !slots[change.Slot] {
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
	input := b.Base
	input.GearChanges = b.Candidates[0].GearChanges
	payload, err := e.runReport(ctx, input, b.Candidates)
	if err != nil {
		return nil, err
	}
	rows, err := parseSimulationBatch(payload, len(b.Candidates), e.iterationBudget(input))
	if err == nil && owned && !strings.HasSuffix(rows[0].Engine, " · 18428cd") {
		return nil, errUnsupportedOwnedBatch
	}
	return rows, err
}

func parseSimulationBatch(payload []byte, count, expectedIterations int) ([]batchMeasurement, error) {
	if count < 1 || count > maxSimulationBatch || expectedIterations < 2 {
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
				CollectedData struct {
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
		sim.Options.Iterations != expectedIterations || sim.Options.Confidence <= 0 || sim.Options.Confidence >= 1 ||
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
		measurements[i] = batchMeasurement{int(math.Round(mean)), mean, *standardError, iterations, confidence, engine}
		return nil
	}
	base := sim.Players[0].CollectedData
	// The pinned binary excludes its warm-up iteration from sample statistics.
	// Keep the configured iteration budget on the wire, but reject a truncated
	// sample set rather than treating its uncertainty as the requested precision.
	if base.DPS.Count == nil || (*base.DPS.Count != expectedIterations-1 && *base.DPS.Count != expectedIterations) {
		return nil, errors.New("incomplete SimulationCraft DPS samples")
	}
	iterations := base.TotalIterations
	if iterations == 0 {
		iterations = sim.Options.Iterations
	}
	if err := add(0, base.DPS.Mean, base.DPS.Error, iterations); err != nil {
		return nil, err
	}
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
