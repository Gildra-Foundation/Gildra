package rotationlab

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

const batchReportFixture = `{"version":"1210-01","git_revision":"18428cd3902","sim":{
    "options":{"iterations":100,"confidence":0.95},
    "players":[{"collected_data":{"dps":{"mean":4321.87654,"mean_std_dev":0.78,"count":99}}}],
    "profilesets":{"metric":"Damage per Second","results":[
        {"name":"c2","mean":8765.4321,"mean_stddev":1.23,"iterations":100},
        {"name":"c1","mean":1234.56789,"mean_stddev":0,"iterations":100}
    ]}}}`

func TestWorkerSimulationBatch(t *testing.T) {
	engine, _ := admissionTestEngine(t, 2)
	// Confirm that the first row is the primary actor, and every later row
	// overwrites both slots, even when their order changes between candidates.
	script := `#!/bin/sh
set -eu
test "$GILDRA_SIMC_BATCH_SINGLE_INIT" = 1
grep -qx 'neck=gildra_candidate,id=1001,source=local' "$1"
grep -qx 'head=gildra_candidate,id=1002,source=local' "$1"
printf '%s\n' "$@" > args
grep -q 'full_states=0$' args
for arg in 'threads=1' 'deterministic=1' 'report_details=0' 'profileset_work_threads=0' 'profileset_init_threads=1' 'iterations=100' \
    'profileset.c1+=head=gildra_candidate,id=2002,source=local,enchant_id=123' \
    'profileset.c1+=neck=gildra_candidate,id=2001,source=local,gem_id=0/12' \
    'profileset.c2+=neck=gildra_candidate,id=3001,source=local' \
    'profileset.c2+=head=gildra_candidate,id=3002,source=local'; do
    grep -Fqx "$arg" args
done
cat > report.json <<'REPORT'
` + batchReportFixture + "\nREPORT\n"
	if err := os.WriteFile(engine.binary, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	b := simulationBatch{Base: nativeGearInput(t), Candidates: []batchCandidate{
		{GearChanges: []GearChange{{Slot: "neck", ItemID: 1001}, {Slot: "head", ItemID: 1002}}},
		{GearChanges: []GearChange{{Slot: "head", ItemID: 2002, EnchantID: 123}, {Slot: "neck", ItemID: 2001, GemIDs: []int{0, 12}}}},
		{GearChanges: []GearChange{{Slot: "neck", ItemID: 3001}, {Slot: "head", ItemID: 3002}}},
	}}
	b.Base.Precision = auctionCandidatePrecision
	body, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	for _, postgres := range []bool{false, true} {
		mux := http.NewServeMux()
		worker := NewWorkerHandler(engine)
		if postgres {
			worker.RegisterNativeRoutes(mux, true)
		} else {
			worker.Register(mux)
		}
		health := httptest.NewRecorder()
		mux.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		if health.Header().Get("X-Gildra-Simulation-Batch") != "25" || health.Header().Get("X-Gildra-Simulation-Concurrency") != "2" {
			t.Fatal(health.Header())
		}
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations/batch", bytes.NewReader(body)))
		if res.Code != 201 || res.Header().Get("X-Gildra-Engine") != "simulationcraft" || !strings.Contains(res.Header().Get("Server-Timing"), "native;dur=") {
			t.Fatal(res.Code, res.Body.String(), res.Header())
		}
		var reply struct {
			Results []batchMeasurement `json:"results"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &reply); err != nil {
			t.Fatal(err)
		}
		want := []batchMeasurement{
			{4322, 4321.87654, .78, 100, 95, "SimulationCraft 1210-01 · 18428cd"},
			{1235, 1234.56789, 0, 100, 95, "SimulationCraft 1210-01 · 18428cd"},
			{8765, 8765.4321, 1.23, 100, 95, "SimulationCraft 1210-01 · 18428cd"},
		}
		if len(reply.Results) != len(want) {
			t.Fatal(reply)
		}
		for i, row := range reply.Results {
			if row != want[i] {
				t.Errorf("row %d: got %+v, want %+v", i, row, want[i])
			}
		}
	}
}

func TestMixedSlotBatchUsesUnchangedArmoryAndOmitsPrimaryResult(t *testing.T) {
	engine, _ := admissionTestEngine(t, 2)
	script := `#!/bin/sh
set -eu
if grep -q '=gildra_candidate,' "$1"; then exit 1; fi
printf '%s\n' "$@" > args
grep -Fqx 'profileset.c1+=head=gildra_candidate,id=1001,source=local' args
grep -Fqx 'profileset.c2+=neck=gildra_candidate,id=1002,source=local' args
cat > report.json <<'REPORT'
` + batchReportFixture + "\nREPORT\n"
	if err := os.WriteFile(engine.binary, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	b := simulationBatch{MixedSlots: true, Base: nativeGearInput(t), Candidates: []batchCandidate{
		{GearChanges: []GearChange{{Slot: "head", ItemID: 1001}}},
		{GearChanges: []GearChange{{Slot: "neck", ItemID: 1002}}},
	}}
	b.Base.Precision = auctionCandidatePrecision
	rows, err := engine.SimulateBatch(context.Background(), b)
	if err != nil || len(rows) != 2 || rows[0].DPSMean != 1234.56789 || rows[1].DPSMean != 8765.4321 {
		t.Fatal(rows, err)
	}
	if err := os.WriteFile(engine.binary, []byte(strings.ReplaceAll(script, "18428cd3902", "unknown")), 0700); err != nil {
		t.Fatal(err)
	}
	if rows, err := engine.SimulateBatch(context.Background(), b); err != errUnsupportedMixedSlots || rows != nil {
		t.Fatalf("unexpected mixed output from unknown revision: %v %v", rows, err)
	}
	b.Base.Precision = auctionFinalistPrecision
	if b.validate() == nil {
		t.Fatal("mixed finalist requests must retain homogeneous slots")
	}
}

func TestSimulationBatchRejectsIncompleteNativeOutput(t *testing.T) {
	for _, bad := range []struct{ from, to string }{
		{`"mean_std_dev":0.78`, `"std_dev":0.78`},
		{`"count":99`, `"samples":99`},
		{`"count":99`, `"count":98`},
		{`"confidence":0.95`, `"confidence":1`},
		{`"mean_stddev":0`, `"mean_error":0`},
		{`"name":"c2"`, `"name":"c1"`},
		{`"name":"c2"`, `"name":"c3"`},
		{`"name":"c2"`, `"name":"other"`},
		{`"iterations":100}`, `"iterations":95}`},
		{`"Damage per Second"`, `"Healing per Second"`},
		{`"mean":1234.56789`, `"mean":0`},
	} {
		report := strings.Replace(batchReportFixture, bad.from, bad.to, 1)
		if rows, err := parseSimulationBatch([]byte(report), 3, 100); err == nil || rows != nil {
			t.Errorf("accepted %v", bad)
		}
	}
	if _, err := parseSimulationBatch([]byte(batchReportFixture), 4, 100); err == nil {
		t.Fatal("missing row accepted")
	}
	if _, err := parseSimulationBatch([]byte(batchReportFixture), 3, 750); err == nil {
		t.Fatal("wrong precision accepted")
	}
}

func TestInvalidSimulationBatchNeverStartsProcess(t *testing.T) {
	for name, mutate := range map[string]func(*simulationBatch){
		"empty":      func(b *simulationBatch) { b.Candidates = nil },
		"oversized":  func(b *simulationBatch) { b.Candidates = make([]batchCandidate, maxSimulationBatch+1) },
		"no changes": func(b *simulationBatch) { b.Candidates[0].GearChanges = nil },
		"mixed slots": func(b *simulationBatch) {
			b.Candidates = append(b.Candidates, batchCandidate{GearChanges: []GearChange{{Slot: "head", ItemID: 12}}})
		},
		"duplicate slot": func(b *simulationBatch) {
			b.Candidates[0].GearChanges = append(b.Candidates[0].GearChanges, b.Candidates[0].GearChanges[0])
		},
		"bad variant":           func(b *simulationBatch) { b.Candidates[0].GearChanges[0].ItemID = 0 },
		"ambiguous base":        func(b *simulationBatch) { b.Base.GearChanges = b.Candidates[0].GearChanges },
		"unsupported precision": func(b *simulationBatch) { b.Base.Precision = "finalist" },
	} {
		t.Run(name, func(t *testing.T) {
			e, marker := admissionTestEngine(t)
			b := simulationBatch{Base: nativeGearInput(t), Candidates: []batchCandidate{{GearChanges: []GearChange{{Slot: "neck", ItemID: 11}}}}}
			b.Base.Precision = auctionCandidatePrecision
			mutate(&b)
			if _, err := e.SimulateBatch(context.Background(), b); !errors.Is(err, errInvalidSimulationBatch) {
				t.Fatal(err)
			}
			if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("native command executed")
			}
		})
	}
}
