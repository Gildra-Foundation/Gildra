package rotationlab

import (
	"encoding/json"
	"errors"
	"net/http"
)

type presetProvider interface {
	RotationPreset(string, string) (RotationPreset, error)
}

type WorkerHandler struct{ engine SimulationEngine }

func NewWorkerHandler(engine SimulationEngine) *WorkerHandler { return &WorkerHandler{engine: engine} }

func (h *WorkerHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("GET /v1/wow/rotation/{slug}", h.preset)
	mux.HandleFunc("POST /v1/wow/rotation/simulations", h.simulate)
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
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_ = json.NewEncoder(w).Encode(preset)
}

func (h *WorkerHandler) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
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
		if errors.Is(err, ErrUnsupportedCombatModel) {
			writeProblem(w, http.StatusUnprocessableEntity, "unsupported_combat_model", err.Error())
			return
		}
		if errors.Is(err, ErrSimulationBusy) {
			w.Header().Set("Retry-After", "1")
		}
		writeProblem(w, http.StatusServiceUnavailable, "simulation_unavailable", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Gildra-Engine", "simulationcraft")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}
