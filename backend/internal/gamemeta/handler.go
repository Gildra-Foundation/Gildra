package gamemeta

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
)

type Store interface {
	WoWTierList(context.Context, Query) (Snapshot, error)
	WoWTierListContexts(ctx context.Context, activity, locale string) ([]Context, error)
	WoWMythicPlusMeta(context.Context) (MythicPlusMeta, error)
}

type Handler struct{ store Store }

func NewHandler(store Store) *Handler { return &Handler{store: store} }

// publicMetaCache lets the edge share published tier lists between visitors.
const publicMetaCache = "public, max-age=300, s-maxage=900, stale-if-error=86400"

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/meta/wow/tier-list", h.wowTierList)
	mux.HandleFunc("GET /v1/meta/wow/tier-list/contexts", h.wowTierListContexts)
	mux.HandleFunc("GET /v1/meta/wow/mythic-plus/meta", h.wowMythicPlusMeta)
}

func (h *Handler) wowMythicPlusMeta(w http.ResponseWriter, r *http.Request) {
	meta, err := h.store.WoWMythicPlusMeta(r.Context())
	if errors.Is(err, ErrSnapshotNotFound) {
		writeProblem(w, r, http.StatusNotFound, "snapshot_not_found", "no published Mythic+ meta snapshot is available")
		return
	}
	if err != nil {
		slog.Error("read public WoW Mythic+ meta", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "meta_unavailable", "Mythic+ meta data is temporarily unavailable")
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, meta)
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
	query.Source = r.URL.Query().Get("source")
	if _, known := sourceDatasets[query.Source]; query.Source != SourceGildra && !known {
		writeProblem(w, r, http.StatusBadRequest, "invalid_source", "source must be ugg or mythicstats")
		return
	}
	if query.Source == SourceMythicStats && query.Activity != "mythic_plus" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_activity", "mythicstats only publishes a mythic_plus tier list")
		return
	}
	if query.Source == SourceUgg {
		if _, ok := uggDifficulty(query.Activity, query.Difficulty); !ok {
			writeProblem(w, r, http.StatusBadRequest, "invalid_difficulty", "difficulty is not supported")
			return
		}
	}
	validDifficulty := map[string]bool{"": true, "raid_myth": true, "raid_hero": true, "raid_normal": true, "raid_n10": true, "raid_n25": true, "raid_h10": true, "raid_h25": true}
	if query.Source != SourceUgg && !validDifficulty[query.Difficulty] {
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

	httpjson.Write(w, http.StatusOK, publicMetaCache, snapshot)
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
	// wow.gg names dungeons, raids and bosses in Russian; en_US swaps in the game's own English names.
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = SourceLocale
	}
	if locale != SourceLocale && locale != "en_US" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_locale", "locale must be ru_RU or en_US")
		return
	}
	contexts, err := h.store.WoWTierListContexts(r.Context(), activity, locale)
	if err != nil {
		slog.Error("read public WoW tier-list contexts", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "meta_unavailable", "WoW meta contexts are temporarily unavailable")
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, map[string]any{"activity": activity, "locale": locale, "contexts": contexts})
}

func writeProblem(w http.ResponseWriter, r *http.Request, status int, code, detail string) {
	httpjson.WriteProblem(w, status, httpjson.NoStore, httpjson.Problem{
		Type: "https://api.gildra.net/errors/meta/" + code, Title: http.StatusText(status), Status: status, Detail: detail, Instance: r.URL.Path,
	})
}
