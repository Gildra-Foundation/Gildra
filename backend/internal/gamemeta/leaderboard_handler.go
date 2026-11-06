package gamemeta

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"unicode/utf8"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
)

// LeaderboardStore reads a region's published Mythic+ leaderboard.
type LeaderboardStore interface {
	WoWMythicPlusLeaderboard(ctx context.Context, region string) (*LeaderboardSnapshot, error)
}

type LeaderboardHandler struct{ store LeaderboardStore }

func NewLeaderboardHandler(store LeaderboardStore) *LeaderboardHandler {
	return &LeaderboardHandler{store: store}
}

// Realm slugs are lower-case and may carry letters beyond ASCII ("aggra-português").
var leaderboardRealmRE = regexp.MustCompile(`^[\p{Ll}\p{Lo}0-9'-]{2,64}$`)

func (h *LeaderboardHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/meta/wow/mythic-plus/leaderboard", h.leaderboard)
}

// leaderboard: GET /v1/meta/wow/mythic-plus/leaderboard?region=eu&role=&class=&spec=&realm=&q=&page=&limit=
func (h *LeaderboardHandler) leaderboard(w http.ResponseWriter, r *http.Request) {
	values := r.URL.Query()
	query := LeaderboardQuery{Region: values.Get("region"), Role: values.Get("role"), Realm: values.Get("realm"), Search: values.Get("q"), Page: 1, PageSize: 50}
	if query.Region == "" {
		query.Region = "eu"
	}
	if !IsLeaderboardRegion(query.Region) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_region", "region must be eu, us, kr or tw")
		return
	}
	if query.Role != "" && query.Role != "tank" && query.Role != "healer" && query.Role != "dps" {
		writeProblem(w, r, http.StatusBadRequest, "invalid_role", "role must be tank, healer or dps")
		return
	}
	var ok bool
	if query.ClassID, ok = intParam(values.Get("class"), 1, 20); !ok {
		writeProblem(w, r, http.StatusBadRequest, "invalid_class", "class must be a playable class id")
		return
	}
	if query.SpecID, ok = intParam(values.Get("spec"), 1, 5000); !ok {
		writeProblem(w, r, http.StatusBadRequest, "invalid_spec", "spec must be a playable specialization id")
		return
	}
	if query.Realm != "" && !leaderboardRealmRE.MatchString(query.Realm) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_realm", "realm must be a realm slug")
		return
	}
	if utf8.RuneCountInString(query.Search) > 40 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_search", "q is too long")
		return
	}
	if raw := values.Get("page"); raw != "" {
		if query.Page, ok = intParam(raw, 1, 100); !ok {
			writeProblem(w, r, http.StatusBadRequest, "invalid_page", "page must be between 1 and 100")
			return
		}
	}
	if raw := values.Get("limit"); raw != "" {
		if query.PageSize, ok = intParam(raw, 5, 100); !ok {
			writeProblem(w, r, http.StatusBadRequest, "invalid_limit", "limit must be between 5 and 100")
			return
		}
	}
	snapshot, err := h.store.WoWMythicPlusLeaderboard(r.Context(), query.Region)
	if errors.Is(err, ErrSnapshotNotFound) {
		writeProblem(w, r, http.StatusNotFound, "snapshot_not_found", "no published Mythic+ leaderboard is available for this region")
		return
	}
	if err != nil {
		slog.Error("read public WoW Mythic+ leaderboard", "region", query.Region, "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "leaderboard_unavailable", "Mythic+ leaderboard is temporarily unavailable")
		return
	}
	httpjson.Write(w, http.StatusOK, publicMetaCache, snapshot.Query(query))
}

// intParam parses an optional bounded integer; "" is 0 and valid.
func intParam(raw string, min, max int) (int, bool) {
	if raw == "" {
		return 0, true
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < min || value > max {
		return 0, false
	}
	return value, true
}
