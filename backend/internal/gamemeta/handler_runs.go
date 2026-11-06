package gamemeta

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
)

var dungeonSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// registerMythicPlusRuns adds the endpoints computed from the Raider.IO run
// sample (dataset mplus-runs-raiderio): compositions, season stats and the
// route finder. Every block of a response comes from the same filtered runs.
func (h *Handler) registerMythicPlusRuns(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/meta/wow/mythic-plus/comps", h.wowMythicPlusComps)
	mux.HandleFunc("GET /v1/meta/wow/mythic-plus/stats", h.wowMythicPlusStats)
	mux.HandleFunc("GET /v1/meta/wow/mythic-plus/runs", h.wowMythicPlusRuns)
}

// runsFilter reads dungeon, region, minLevel and specs; false means a 400 was written.
func runsFilter(w http.ResponseWriter, r *http.Request) (RunsFilter, bool) {
	query := r.URL.Query()
	filter := RunsFilter{Dungeon: query.Get("dungeon"), Region: query.Get("region")}
	if filter.Dungeon != "" && filter.Dungeon != "all" && !dungeonSlugPattern.MatchString(filter.Dungeon) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_dungeon", "dungeon must be a dungeon slug or all")
		return filter, false
	}
	if filter.Region != "" && filter.Region != "all" && !runsRegions[filter.Region] {
		writeProblem(w, r, http.StatusBadRequest, "invalid_region", "region must be all, us, eu, kr or tw")
		return filter, false
	}
	if raw := query.Get("minLevel"); raw != "" {
		level, err := strconv.Atoi(raw)
		if err != nil || level < 0 || level > 40 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_min_level", "minLevel must be between 0 and 40")
			return filter, false
		}
		filter.MinLevel = level
	}
	specs, err := ParseSpecList(query.Get("specs"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_specs", "specs must be up to five specialization ids")
		return filter, false
	}
	filter.Specs = specs
	return filter, true
}

func (h *Handler) runsSnapshot(w http.ResponseWriter, r *http.Request) (*RunsSnapshot, bool) {
	snapshot, err := h.store.WoWMythicPlusRuns(r.Context())
	if errors.Is(err, ErrSnapshotNotFound) {
		writeProblem(w, r, http.StatusNotFound, "snapshot_not_found", "no published Mythic+ run sample is available")
		return nil, false
	}
	if err != nil {
		slog.Error("read public WoW Mythic+ runs", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "meta_unavailable", "Mythic+ run data is temporarily unavailable")
		return nil, false
	}
	return snapshot, true
}

func writeRunsFilterError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrUnknownDungeon):
		writeProblem(w, r, http.StatusBadRequest, "invalid_dungeon", "dungeon is not part of the current season")
	case errors.Is(err, ErrInvalidRegion):
		writeProblem(w, r, http.StatusBadRequest, "invalid_region", "region must be all, us, eu, kr or tw")
	default:
		writeProblem(w, r, http.StatusBadRequest, "invalid_specs", "specs must be known ids forming at most one tank, one healer and three damage dealers")
	}
}

func (h *Handler) wowMythicPlusComps(w http.ResponseWriter, r *http.Request) {
	filter, ok := runsFilter(w, r)
	if !ok {
		return
	}
	snapshot, ok := h.runsSnapshot(w, r)
	if !ok {
		return
	}
	response, err := snapshot.Comps(filter)
	if err != nil {
		writeRunsFilterError(w, r, err)
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, response)
}

func (h *Handler) wowMythicPlusStats(w http.ResponseWriter, r *http.Request) {
	filter, ok := runsFilter(w, r)
	if !ok {
		return
	}
	snapshot, ok := h.runsSnapshot(w, r)
	if !ok {
		return
	}
	response, err := snapshot.Stats(filter)
	if err != nil {
		writeRunsFilterError(w, r, err)
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, response)
}

func (h *Handler) wowMythicPlusRuns(w http.ResponseWriter, r *http.Request) {
	filter, ok := runsFilter(w, r)
	if !ok {
		return
	}
	order := r.URL.Query().Get("sort")
	if order == "" {
		order = "level"
	}
	if !RunSorts[order] {
		writeProblem(w, r, http.StatusBadRequest, "invalid_sort", "sort must be level, fast or recent")
		return
	}
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 100")
			return
		}
		limit = value
	}
	snapshot, ok := h.runsSnapshot(w, r)
	if !ok {
		return
	}
	response, err := snapshot.Runs(filter, order, limit)
	if err != nil {
		writeRunsFilterError(w, r, err)
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, response)
}
