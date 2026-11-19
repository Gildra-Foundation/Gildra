package rotationlab

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
)

type presetProvider interface {
	RotationPreset(string, string) (RotationPreset, error)
}

type WorkerHandler struct{ engine SimulationEngine }

func NewWorkerHandler(engine SimulationEngine) *WorkerHandler { return &WorkerHandler{engine: engine} }

func (h *WorkerHandler) Register(mux *http.ServeMux) {
	h.RegisterNativeRoutes(mux, false)
	mux.HandleFunc("GET /v1/wow/rotation/{slug}", h.preset)
	mux.HandleFunc("POST /v1/wow/rotation/simulations", withWorkerTiming(h.simulate))
}

func (h *WorkerHandler) preset(w http.ResponseWriter, r *http.Request) {
	provider, ok := h.engine.(presetProvider)
	if !ok {
		writeProblem(w, http.StatusNotImplemented, "preset_unavailable", "rotation presets are unavailable")
		return
	}
	preset, err := provider.RotationPreset(r.PathValue("slug"), r.URL.Query().Get("locale"))
	if err != nil {
		writeProblem(w, http.StatusNotFound, "preset_not_found", err.Error())
		return
	}
	httpjson.Write(w, http.StatusOK, "public, max-age=300", preset)
}

// RegisterNativeRoutes serves the same engine capabilities in stateless and
// database-backed worker deployments.
func (h *WorkerHandler) RegisterNativeRoutes(mux *http.ServeMux, postgres bool) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { h.health(w, postgres) })
	mux.HandleFunc("POST /v1/wow/gear/variants", withWorkerTiming(h.resolveVariants))
	mux.HandleFunc("POST /v1/wow/rotation/simulations/batch", withWorkerTiming(h.simulateBatch))
}

func (h *WorkerHandler) health(w http.ResponseWriter, postgres bool) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if native, ok := h.engine.(interface{ NativeSimulationConcurrency() int }); ok {
		if capacity := native.NativeSimulationConcurrency(); capacity >= 1 && capacity <= maxSimCConcurrency {
			w.Header().Set("X-Gildra-Simulation-Concurrency", strconv.Itoa(capacity))
		}
	}
	if _, ok := h.engine.(batchEngine); ok {
		w.Header().Set("X-Gildra-Simulation-Batch", strconv.Itoa(maxSimulationBatch))
		w.Header().Set("X-Gildra-Simulation-Owned-Batch", "1")
	}
	if postgres {
		_, _ = w.Write([]byte(`{"status":"ok","engine":"simulationcraft","storage":"postgres"}`))
		return
	}
	_, _ = w.Write([]byte(`{"status":"ok","engine":"simulationcraft"}`))
}

func (h *WorkerHandler) simulate(w http.ResponseWriter, r *http.Request) {
	// Blizzard specialization payloads can exceed 250 KiB; this internal boundary
	// still enforces a hard cap before decoding.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input SimulationInput
	if err := decoder.Decode(&input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid simulation request")
		return
	}
	if err := ValidateInput(input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_simulation", err.Error())
		return
	}
	result, err := h.engine.Simulate(r.Context(), input)
	if err != nil {
		writeWorkerSimulationError(w, err)
		return
	}
	w.Header().Set("X-Gildra-Engine", "simulationcraft")
	httpjson.Write(w, http.StatusCreated, httpjson.PrivateNoStore, result)
}

func (h *WorkerHandler) simulateBatch(w http.ResponseWriter, r *http.Request) {
	engine, ok := h.engine.(batchEngine)
	if !ok {
		writeProblem(w, http.StatusNotImplemented, "batch_unavailable", "native simulation batches are unavailable")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input simulationBatch
	if err := decoder.Decode(&input); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid simulation batch")
		return
	}
	results, err := engine.SimulateBatch(r.Context(), input)
	if err != nil {
		writeWorkerSimulationError(w, err)
		return
	}
	if len(input.Candidates) > 0 && len(input.Candidates[0].OwnedChanges) > 0 {
		w.Header().Set("X-Gildra-Simulation-Owned-Batch", "1")
	}
	w.Header().Set("X-Gildra-Engine", "simulationcraft")
	httpjson.Write(w, http.StatusCreated, httpjson.PrivateNoStore, struct {
		Results []batchMeasurement `json:"results"`
	}{results})
}

func writeWorkerSimulationError(w http.ResponseWriter, err error) {
	if errors.Is(err, errUnsupportedOwnedBatch) {
		writeProblem(w, http.StatusUnprocessableEntity, "unsupported_owned_batch", err.Error())
		return
	}
	if errors.Is(err, errInvalidSimulationBatch) {
		writeProblem(w, http.StatusBadRequest, "invalid_simulation", err.Error())
		return
	}
	if errors.Is(err, ErrUnsupportedCombatModel) {
		writeProblem(w, http.StatusUnprocessableEntity, "unsupported_combat_model", err.Error())
		return
	}
	if errors.Is(err, ErrSimulationBusy) {
		w.Header().Set("Retry-After", "1")
	}
	writeProblem(w, http.StatusServiceUnavailable, "simulation_unavailable", err.Error())
}
