package rotationlab

import (
	"context"

	"github.com/google/uuid"
)

func isAuctionMeasurement(input SimulationInput) bool {
	return input.ActionListMode == ActionListModeNative &&
		(input.Precision == auctionCandidatePrecision || input.Precision == auctionFinalistPrecision)
}

// Auction scoring needs native uncertainty, not the editor's playback data.
// Keep the established result envelope so database-backed workers can persist
// these runs with the same ID, context and engine metadata as full simulations.
func (e *SimCEngine) simulateMeasurement(ctx context.Context, input SimulationInput) (SimulationResult, error) {
	payload, err := e.runReport(ctx, input, nil)
	if err != nil {
		return SimulationResult{}, err
	}
	measurements, err := parseSimulationBatch(payload, 1, e.iterationBudget(input))
	if err != nil {
		return SimulationResult{}, err
	}
	m := measurements[0]
	baselineIncluded := false
	return SimulationResult{
		ID: uuid.NewString(), Status: "completed", Engine: m.Engine,
		Scenario: input.Scenario, FightLengthSeconds: input.FightLengthSeconds, Targets: input.Targets,
		DPS: m.DPS, DPSMean: m.DPSMean, DPSError: m.DPSError, Iterations: m.Iterations, Confidence: m.Confidence,
		BaselineIncluded: &baselineIncluded,
		ModelNotice:      "SimulationCraft measured the character gear with its maintained default action priority list.",
		Accuracy:         Accuracy{Mode: "simulationcraft-armory", RotationSource: "simulationcraft-default-apl"},
	}, nil
}
