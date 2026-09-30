package rotationlab

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeAPI struct {
	preset json.RawMessage
	result SimulationResult
	err    error
}

func (f fakeAPI) Preset(context.Context, string, string) (json.RawMessage, error) {
	return f.preset, f.err
}
func (f fakeAPI) Simulate(context.Context, SimulationInput) (SimulationResult, error) {
	return f.result, f.err
}

func TestGetPreset(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(fakeAPI{preset: json.RawMessage(`{"slug":"fury-warrior"}`)}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/wow/rotation/fury-warrior?locale=en_US", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("unexpected cache header")
	}
}

func TestSimulateRejectsInvalidRules(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(fakeAPI{}).Register(mux)
	body := `{"spec":"fury-warrior","scenario":"single-target","fightLengthSeconds":120,"targets":1,"rules":["unknown/../../profile"]}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/rotation/simulations", strings.NewReader(body)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", response.Code)
	}
}
