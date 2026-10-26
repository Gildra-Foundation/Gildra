package transmog

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
)

// Store is what the handler needs from the service; tests use a fixed index.
type Store interface {
	Index(context.Context) (*Index, error)
}

type Handler struct{ store Store }

func NewHandler(store Store) *Handler { return &Handler{store: store} }

// publicCache lets the edge share answers: they only change with a catalog build.
const publicCache = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400"

const (
	defaultLimit = 40
	maxLimit     = 100
	maxResolve   = 32
	maxQuery     = 80
)

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/wow/transmog/appearances", h.appearances)
	mux.HandleFunc("GET /v1/wow/transmog/sets", h.sets)
	mux.HandleFunc("GET /v1/wow/transmog/sets/{id}", h.set)
}

func locale(r *http.Request) string {
	if r.URL.Query().Get("locale") == "ru_RU" {
		return "ru_RU"
	}
	return "en_US"
}

func pageParams(w http.ResponseWriter, r *http.Request) (offset, limit int, ok bool) {
	limit = defaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > maxLimit {
			writeProblem(w, r, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 100")
			return 0, 0, false
		}
		limit = value
	}
	offset, err := decodeOffset(r.URL.Query().Get("cursor"))
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_cursor", "cursor is not valid")
		return 0, 0, false
	}
	return offset, limit, true
}

// indexWait bounds how long a request waits for the first load, below the
// API request deadline; the load itself continues in the background.
var indexWait = 12 * time.Second

func (h *Handler) index(w http.ResponseWriter, r *http.Request) (*Index, bool) {
	ctx, cancel := context.WithTimeout(r.Context(), indexWait)
	defer cancel()
	index, err := h.store.Index(ctx)
	if err != nil {
		if r.Context().Err() != nil {
			return nil, false
		}
		if errors.Is(err, context.DeadlineExceeded) {
			w.Header().Set("Retry-After", "10")
			writeProblem(w, r, http.StatusServiceUnavailable, "transmog_loading", "transmog data is loading, retry shortly")
			return nil, false
		}
		slog.Error("load transmog index", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "transmog_unavailable", "transmog data is temporarily unavailable")
		return nil, false
	}
	return index, true
}

// appearances answers two questions: ?slot=… searches the looks of a slot,
// ?ids=… resolves ItemModifiedAppearanceIDs of a share link.
func (h *Handler) appearances(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if raw := query.Get("ids"); raw != "" {
		parts := strings.Split(raw, ",")
		if len(parts) > maxResolve {
			writeProblem(w, r, http.StatusBadRequest, "too_many_ids", "at most 32 ids are allowed")
			return
		}
		ids := make([]int64, 0, len(parts))
		for _, part := range parts {
			id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
			if err != nil || id <= 0 {
				writeProblem(w, r, http.StatusBadRequest, "invalid_ids", "ids must be positive integers")
				return
			}
			ids = append(ids, id)
		}
		index, ok := h.index(w, r)
		if !ok {
			return
		}
		httpjson.Write(w, http.StatusOK, publicCache, map[string]any{"data": index.Resolve(ids, locale(r)), "buildId": index.BuildID})
		return
	}
	slot := Slot(query.Get("slot"))
	if slotOrder(slot) == len(Slots) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_slot", "slot must be one of head, shoulder, back, chest, shirt, tabard, wrist, hands, waist, legs, feet, main-hand, off-hand")
		return
	}
	armor := query.Get("armor")
	if _, known := armorSubclasses[armor]; armor != "" && !known {
		writeProblem(w, r, http.StatusBadRequest, "invalid_armor", "armor must be cloth, leather, mail, plate or cosmetic")
		return
	}
	text := query.Get("q")
	if len([]rune(text)) > maxQuery {
		writeProblem(w, r, http.StatusBadRequest, "invalid_query", "q must not exceed 80 characters")
		return
	}
	offset, limit, ok := pageParams(w, r)
	if !ok {
		return
	}
	index, ok := h.index(w, r)
	if !ok {
		return
	}
	httpjson.Write(w, http.StatusOK, publicCache, index.Appearances(AppearanceQuery{
		Slot: slot, Query: text, Armor: armor, Locale: locale(r), Offset: offset, Limit: limit,
	}))
}

func (h *Handler) sets(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	text := query.Get("q")
	if len([]rune(text)) > maxQuery {
		writeProblem(w, r, http.StatusBadRequest, "invalid_query", "q must not exceed 80 characters")
		return
	}
	classID := 0
	if raw := query.Get("class"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 30 {
			writeProblem(w, r, http.StatusBadRequest, "invalid_class", "class must be a class ID between 1 and 30")
			return
		}
		classID = value
	}
	offset, limit, ok := pageParams(w, r)
	if !ok {
		return
	}
	index, ok := h.index(w, r)
	if !ok {
		return
	}
	httpjson.Write(w, http.StatusOK, publicCache, index.Sets(SetQuery{Query: text, ClassID: classID, Locale: locale(r), Offset: offset, Limit: limit}))
}

func (h *Handler) set(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeProblem(w, r, http.StatusBadRequest, "invalid_id", "set id must be a positive integer")
		return
	}
	index, ok := h.index(w, r)
	if !ok {
		return
	}
	detail, found := index.Set(id, locale(r))
	if !found {
		writeProblem(w, r, http.StatusNotFound, "set_not_found", "transmog set has no wearable appearances")
		return
	}
	httpjson.Write(w, http.StatusOK, publicCache, detail)
}

func writeProblem(w http.ResponseWriter, r *http.Request, status int, code, detail string) {
	httpjson.WriteProblem(w, status, httpjson.NoStore, httpjson.Problem{
		Type: "https://api.gildra.net/errors/transmog/" + code, Title: http.StatusText(status), Status: status, Detail: detail, Instance: r.URL.Path,
	})
}
