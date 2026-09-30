package rotationlab

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type API interface {
	Preset(context.Context, string, string) (json.RawMessage, error)
	Simulate(context.Context, SimulationInput) (SimulationResult, error)
}

type Handler struct{ api API }

func NewHandler(api API) *Handler { return &Handler{api: api} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/wow/rotation/{spec}", h.getPreset)
	mux.HandleFunc("POST /v1/wow/rotation/simulations", h.simulate)
}

func (h *Handler) getPreset(w http.ResponseWriter, r *http.Request) {
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = "en_US"
	}
	if locale != "en_US" && locale != "ru_RU" {
		writeProblem(w, http.StatusBadRequest, "invalid_locale", "locale must be en_US or ru_RU")
		return
	}
	payload, err := h.api.Preset(r.Context(), r.PathValue("spec"), locale)
	if errors.Is(err, ErrPresetNotFound) {
		writeProblem(w, http.StatusNotFound, "preset_not_found", "rotation preset not found")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "preset_unavailable", "rotation preset is temporarily unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(payload)
}

func (h *Handler) simulate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
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
	result, err := h.api.Simulate(r.Context(), input)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "simulation_unavailable", "simulation is temporarily unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	if strings.HasPrefix(result.Engine, "SimulationCraft") {
		w.Header().Set("X-Gildra-Engine", "simulationcraft")
	} else {
		w.Header().Set("X-Gildra-Engine", "mvp-fallback")
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

func writeProblem(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}
