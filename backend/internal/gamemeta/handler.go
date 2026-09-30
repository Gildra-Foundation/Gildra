package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
)

type Store interface {
	WoWTierList(context.Context, Query) (Snapshot, error)
	WoWTierListContexts(context.Context, string) ([]Context, error)
}

type Handler struct{ store Store }

func NewHandler(store Store) *Handler { return &Handler{store: store} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/meta/wow/tier-list", h.wowTierList)
	mux.HandleFunc("GET /v1/meta/wow/tier-list/contexts", h.wowTierListContexts)
}

func (h *Handler) wowTierList(w http.ResponseWriter, r *http.Request) {
	query := Query{Activity: r.URL.Query().Get("activity"), Role: r.URL.Query().Get("role"), Limit: 40}
	if query.Activity == "" {
		query.Activity = "mythic_plus"
	}
	if query.Role == "" {
		query.Role = "dps"
	}
	if query.Activity != "mythic_plus" && query.Activity != "raid" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_activity", "activity must be mythic_plus or raid")
		return
	}
	if query.Role != "dps" && query.Role != "healer" && query.Role != "tank" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_role", "role must be dps, healer or tank")
		return
	}
	query.SelectionType = r.URL.Query().Get("selectionType")
	query.SelectionID = r.URL.Query().Get("selectionId")
	query.KeyType = r.URL.Query().Get("keyType")
	query.Difficulty = r.URL.Query().Get("difficulty")
	query.AddonKey = r.URL.Query().Get("addon")
	if query.AddonKey == "" {
		query.AddonKey = "midnight"
	}
	if len(query.AddonKey) > 64 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_addon", "addon is too long")
		return
	}
	if query.SelectionType != "" && query.SelectionType != "all" && query.SelectionType != "dungeon" && query.SelectionType != "raid" && query.SelectionType != "boss" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_selection_type", "selectionType must be all, dungeon, raid or boss")
		return
	}
	if query.SelectionType != "" && query.SelectionType != "all" && (query.SelectionID == "" || len(query.SelectionID) > 64) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_selection_id", "selectionId is required for a specific context")
		return
	}
	if query.KeyType != "" && query.KeyType != "all" && query.KeyType != "high" && query.KeyType != "middle" && query.KeyType != "low" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_key_type", "keyType must be all, high, middle or low")
		return
	}
	validDifficulty := map[string]bool{"": true, "raid_myth": true, "raid_hero": true, "raid_normal": true, "raid_n10": true, "raid_n25": true, "raid_h10": true, "raid_h25": true}
	if !validDifficulty[query.Difficulty] {
		writeProblem(w, r, http.StatusBadRequest, "invalid_difficulty", "difficulty is not supported")
		return
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 60 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 60")
			return
		}
		query.Limit = limit
	}

	snapshot, err := h.store.WoWTierList(r.Context(), query)
	if errors.Is(err, ErrSnapshotNotFound) {
		writeProblem(w, r, http.StatusNotFound, "snapshot_not_found", "no published WoW tier-list snapshot is available")
		return
	}
	if err != nil {
		slog.Error("read public WoW tier list", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "meta_unavailable", "WoW meta data is temporarily unavailable")
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=900, stale-if-error=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = json.NewEncoder(w).Encode(snapshot)
}

func (h *Handler) wowTierListContexts(w http.ResponseWriter, r *http.Request) {
	activity := r.URL.Query().Get("activity")
	if activity == "" {
		activity = "mythic_plus"
	}
	if activity != "mythic_plus" && activity != "raid" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_activity", "activity must be mythic_plus or raid")
		return
	}
	contexts, err := h.store.WoWTierListContexts(r.Context(), activity)
	if err != nil {
		slog.Error("read public WoW tier-list contexts", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "meta_unavailable", "WoW meta contexts are temporarily unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=900, stale-if-error=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = json.NewEncoder(w).Encode(map[string]any{"activity": activity, "contexts": contexts})
}

func writeProblem(w http.ResponseWriter, r *http.Request, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type":  "https://api.gildra.net/errors/meta/" + code,
		"title": http.StatusText(status), "status": status, "detail": detail, "instance": r.URL.Path,
	})
}
