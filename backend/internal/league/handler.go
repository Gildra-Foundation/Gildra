package league

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const apiBase = "/league-of-legends/v1"

var slugValue = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Catalog interface {
	Status(context.Context) (Status, error)
	ListChampions(context.Context, ListParams) (Page[ChampionSummary], error)
	Champion(context.Context, string, string) (ChampionDetail, error)
	ListContent(context.Context, string, ListParams) (Page[ContentEntry], error)
}

type Handler struct{ catalog Catalog }

type problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance"`
}

func NewHandler(catalog Catalog) *Handler { return &Handler{catalog: catalog} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET "+apiBase, h.index)
	mux.HandleFunc("GET "+apiBase+"/", h.index)
	mux.HandleFunc("GET "+apiBase+"/status", h.status)
	mux.HandleFunc("GET "+apiBase+"/champions", h.champions)
	mux.HandleFunc("GET "+apiBase+"/champions/{slug}", h.champion)
	mux.HandleFunc("GET "+apiBase+"/content/{category}", h.content)
}

func (h *Handler) index(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != apiBase && r.URL.Path != apiBase+"/" {
		writeProblem(w, r, 404, "not-found", "Not Found", "The requested League of Legends resource does not exist.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"version": "v1", "status": apiBase + "/status", "locales": []string{"en_US", "ru_RU"},
		"resources": map[string]string{"champions": apiBase + "/champions", "content": apiBase + "/content/{category}"},
	})
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	status, err := h.catalog.Status(r.Context())
	if err != nil {
		slog.Error("read League catalog status", "error", err)
		writeProblem(w, r, 503, "catalog-unavailable", "Catalog unavailable", "The League of Legends catalog could not be read. Retry later.")
		return
	}
	writeJSON(w, 200, status)
}

func (h *Handler) champions(w http.ResponseWriter, r *http.Request) {
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	if params.Tag != "" && !validTag(params.Tag) {
		writeProblem(w, r, 400, "invalid-tag", "Invalid champion tag", "Tag must be Assassin, Fighter, Mage, Marksman, Support or Tank.")
		return
	}
	page, err := h.catalog.ListChampions(r.Context(), params)
	handlePage(w, r, page, err)
}

func (h *Handler) champion(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !slugValue.MatchString(slug) {
		writeProblem(w, r, 400, "invalid-slug", "Invalid champion slug", "Use the lowercase slug returned by the champions collection.")
		return
	}
	locale, ok := parseLocale(w, r)
	if !ok {
		return
	}
	value, err := h.catalog.Champion(r.Context(), slug, locale)
	if errors.Is(err, ErrNotFound) {
		writeProblem(w, r, 404, "not-found", "Champion not found", "The champion does not exist in the active Data Dragon release.")
		return
	}
	if err != nil {
		slog.Error("read League champion", "slug", slug, "error", err)
		writeProblem(w, r, 503, "catalog-unavailable", "Catalog unavailable", "The League of Legends catalog could not be read. Retry later.")
		return
	}
	writeJSON(w, 200, value)
}

func (h *Handler) content(w http.ResponseWriter, r *http.Request) {
	category := r.PathValue("category")
	if !validCategory(category) {
		writeProblem(w, r, 400, "invalid-category", "Invalid content category", "Category must be items, runes, summoner-spells, maps or profile-icons.")
		return
	}
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	page, err := h.catalog.ListContent(r.Context(), category, params)
	handlePage(w, r, page, err)
}

func parseListParams(w http.ResponseWriter, r *http.Request) (ListParams, bool) {
	locale, ok := parseLocale(w, r)
	if !ok {
		return ListParams{}, false
	}
	query := r.URL.Query()
	params := ListParams{Locale: locale, Query: strings.TrimSpace(query.Get("q")), Cursor: query.Get("cursor"), Tag: query.Get("tag"), Limit: 24}
	if len(params.Query) > 200 {
		writeProblem(w, r, 400, "invalid-query", "Invalid search query", "Search query must not exceed 200 characters.")
		return ListParams{}, false
	}
	if raw := query.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			writeProblem(w, r, 400, "invalid-limit", "Invalid limit", "Limit must be between 1 and 100.")
			return ListParams{}, false
		}
		params.Limit = limit
	}
	if _, err := decodeCursor(params.Cursor); err != nil {
		writeProblem(w, r, 400, "invalid-cursor", "Invalid cursor", "Use the opaque nextCursor returned by the previous response.")
		return ListParams{}, false
	}
	return params, true
}

func parseLocale(w http.ResponseWriter, r *http.Request) (string, bool) {
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = "en_US"
	}
	if locale != "en_US" && locale != "ru_RU" {
		writeProblem(w, r, 400, "invalid-locale", "Invalid locale", "Locale must be en_US or ru_RU.")
		return "", false
	}
	return locale, true
}
func validTag(value string) bool {
	switch value {
	case "Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank":
		return true
	default:
		return false
	}
}
func validCategory(value string) bool {
	switch value {
	case "items", "runes", "summoner-spells", "maps", "profile-icons":
		return true
	default:
		return false
	}
}

func handlePage[T any](w http.ResponseWriter, r *http.Request, page Page[T], err error) {
	if errors.Is(err, ErrInvalidCursor) {
		writeProblem(w, r, 400, "invalid-cursor", "Invalid cursor", "Use the opaque nextCursor returned by the previous response.")
		return
	}
	if err != nil {
		slog.Error("read League catalog collection", "path", r.URL.Path, "error", err)
		writeProblem(w, r, 503, "catalog-unavailable", "Catalog unavailable", "The League of Legends catalog could not be read. Retry later.")
		return
	}
	writeJSON(w, 200, page)
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("encode League response", "error", err)
	}
}
func writeProblem(w http.ResponseWriter, r *http.Request, status int, kind, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(problem{Type: "https://api.gildra.net/errors/league-of-legends/" + kind, Title: title, Status: status, Detail: detail, Instance: r.URL.Path}); err != nil {
		slog.Warn("encode League problem", "error", err)
	}
}
