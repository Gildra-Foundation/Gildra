package rotationlab

import (
	"encoding/json"
	"os"
	"testing"
)

// Native report conversion must preserve its measurements before the web
// optimizer computes confidence intervals and whole-loadout value.
func TestNativeGearPrecisionPreservesMeanAndStandardError(t *testing.T) {
	var fixtures []map[string]any
	for _, mean := range []float64{20222.49, 20300.51} {
		const standardError = 28.300123456789
		var report simcReport
		report.Version = "1210-01"
		report.Sim.Options.Iterations = 750
		report.Sim.Options.Confidence = .95
		report.Sim.Players = make([]simcPlayer, 1)
		report.Sim.Players[0].CollectedData.DPS.Mean = mean
		report.Sim.Players[0].CollectedData.DPS.MeanStdDev = standardError
		report.Sim.Players[0].CollectedData.TotalIterations = 750
		result, err := resultFromSimC(nativeGearInput(t), report, 0)
		if err != nil {
			t.Fatal(err)
		}
		raw, err := json.Marshal(result)
		if err != nil {
			t.Fatal(err)
		}
		var wire map[string]any
		if err = json.Unmarshal(raw, &wire); err != nil {
			t.Fatal(err)
		}
		if wire["dpsMean"] != mean {
			t.Errorf("native mean lost precision: mean=%v wire.dpsMean=%v", mean, wire["dpsMean"])
		}
		if wire["dpsError"] != standardError {
			t.Errorf("standard error lost precision: want=%v got=%v", standardError, wire["dpsError"])
		}
		// Keep the established public/editor DPS integer contract during rolling
		// worker-first deployment; the new web uses additive dpsMean for calculations.
		rounded := 20222
		if mean > 20300 {
			rounded = 20301
		}
		if result.DPS != rounded {
			t.Errorf("legacy integer DPS changed: want=%d got=%d", rounded, result.DPS)
		}
		fixtures = append(fixtures, wire)
	}
	if output := os.Getenv("GILDRA_NATIVE_PRECISION_REPORT"); output != "" {
		raw, err := json.MarshalIndent(fixtures, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(output, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
}
