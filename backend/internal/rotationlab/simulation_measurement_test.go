package rotationlab

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
)

type measurementAPI struct {
	fakeAPI
	engine SimulationEngine
}

func (api measurementAPI) Simulate(ctx context.Context, input SimulationInput) (SimulationResult, error) {
	return api.engine.Simulate(ctx, input)
}

func TestAuctionReportsKeepLegacyPlaybackAndPrecision(t *testing.T) {
	e := &SimCEngine{iterations: 750}
	for _, precision := range []string{"", "finalist", auctionCandidatePrecision, auctionFinalistPrecision} {
		input := nativeGearInput(t)
		input.Precision = precision
		compact := precision == auctionCandidatePrecision || precision == auctionFinalistPrecision
		details := "1"
		if compact {
			details = "0"
		}
		args := e.arguments(input, "report.json", "profile.simc")
		for _, want := range []string{"report_details=" + details, "json=report.json,version=2,full_states=" + details,
			"threads=1", "deterministic=1", "vary_combat_length=0", "fixed_time=1"} {
			if !slices.Contains(args, want) {
				t.Fatalf("precision %q missing %q: %v", precision, want, args)
			}
		}
		if isAuctionMeasurement(input) != compact {
			t.Fatalf("unexpected report mode for %q", precision)
		}
	}
	input := nativeGearInput(t)
	input.Precision = auctionCandidatePrecision
	input.ActionListMode = ActionListModeCustom
	if isAuctionMeasurement(input) {
		t.Fatal("custom editor accepted a compact report")
	}
}

func TestAuctionSingleMeasurementPreservesNativeUncertaintyAndRunEnvelope(t *testing.T) {
	for _, precision := range []string{auctionCandidatePrecision, auctionFinalistPrecision} {
		t.Run(precision, func(t *testing.T) {
			e, _ := admissionTestEngine(t)
			input := nativeGearInput(t)
			input.Precision = precision
			iterations := e.iterationBudget(input)
			report := `{"version":"1210-01","git_revision":"18428cd","sim":{"options":{"iterations":` + strconv.Itoa(iterations) + `,"confidence":0.95},"players":[{"collected_data":{"dps":{"mean":4321.87654,"mean_std_dev":0.780123456789,"count":` + strconv.Itoa(iterations-1) + `}}}]}}`
			script := "#!/bin/sh\nset -eu\nprintf '%s\\n' \"$@\" > args\ngrep -qx 'report_details=0' args\ngrep -q 'full_states=0$' args\ncat > report.json <<'REPORT'\n" + report + "\nREPORT\n"
			if err := os.WriteFile(e.binary, []byte(script), 0700); err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(input)
			for _, postgres := range []bool{false, true} {
				mux := http.NewServeMux()
				if postgres {
					// The database-backed handler receives this same typed envelope
					// through Service.Simulate; verify its serializable run metadata.
					NewHandler(&measurementAPI{engine: e}).Register(mux)
				} else {
					NewWorkerHandler(e).Register(mux)
				}
				res := httptest.NewRecorder()
				mux.ServeHTTP(res, httptest.NewRequest("POST", "/v1/wow/rotation/simulations", bytes.NewReader(raw)))
				if res.Code != 201 || !strings.Contains(res.Header().Get("Server-Timing"), "native;dur=") {
					t.Fatal(res.Code, res.Body.String(), res.Header())
				}
				var got SimulationResult
				if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
					t.Fatal(err)
				}
				if got.DPS != 4322 || got.DPSMean != 4321.87654 || got.DPSError != .780123456789 || got.Iterations != iterations || got.Confidence != 95 {
					t.Fatalf("measurement changed: %+v", got)
				}
				if _, err := uuid.Parse(got.ID); err != nil || got.Status != "completed" || got.Scenario != input.Scenario || got.Targets != input.Targets || got.FightLengthSeconds != input.FightLengthSeconds {
					t.Fatalf("incomplete persistent run envelope: %+v", got)
				}
				if got.BaselineIncluded == nil || *got.BaselineIncluded || len(got.Casts) != 0 || len(got.DPSSeries) != 0 || got.Accuracy.RotationSource != "simulationcraft-default-apl" {
					t.Fatalf("measurement contains playback or wrong provenance: %+v", got)
				}
			}
		})
	}
}

// Feed reports from isolated pinned-binary runs through the production parser.
// The generator in work also compares native dps.count, which is intentionally
// kept internal rather than changing the configured-iterations wire contract.
func TestAuctionCompactReportsPinnedOutput(t *testing.T) {
	dir := os.Getenv("GILDRA_COMPACT_NATIVE_REPORT_DIR")
	if dir == "" {
		t.Skip("set GILDRA_COMPACT_NATIVE_REPORT_DIR to isolated native report fixtures")
	}
	for _, iterations := range []int{100, 750} {
		for count, name := range map[int]string{1: "single", 2: "batch"} {
			var full []batchMeasurement
			for _, mode := range []string{"full", "compact"} {
				payload, err := os.ReadFile(filepath.Join(dir, strconv.Itoa(iterations)+"-"+name+"-"+mode+".json"))
				if err != nil {
					t.Fatal(err)
				}
				measurements, err := parseSimulationBatch(payload, count, iterations)
				if err != nil {
					t.Fatalf("%d %s %s: %v", iterations, name, mode, err)
				}
				if mode == "full" {
					full = measurements
				} else if !slices.Equal(full, measurements) {
					t.Fatalf("compact report changed measurements: %v != %v", full, measurements)
				}
			}
		}
	}
}
