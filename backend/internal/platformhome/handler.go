package platformhome

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

type SnapshotStore interface {
	Snapshot(context.Context, string) (json.RawMessage, error)
}

type Handler struct {
	store SnapshotStore
}

func NewHandler(store SnapshotStore) *Handler {
	return &Handler{store: store}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/platform/home", h.getHome)
}

func (h *Handler) getHome(w http.ResponseWriter, r *http.Request) {
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = "en_US"
	}
	if locale != "en_US" && locale != "ru_RU" {
		writeProblem(w, http.StatusBadRequest, "invalid_locale", "locale must be en_US or ru_RU")
		return
	}

	payload, err := h.store.Snapshot(r.Context(), locale)
	if errors.Is(err, ErrSnapshotNotFound) {
		writeProblem(w, http.StatusNotFound, "snapshot_not_found", "no published platform home snapshot exists for this locale")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "snapshot_unavailable", "platform home is temporarily unavailable")
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func writeProblem(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}
