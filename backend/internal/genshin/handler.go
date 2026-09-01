package genshin

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

const apiBase = "/genshin-impact/v1"

var contentCategoryValue = regexp.MustCompile(`^[a-z0-9]{1,64}$`)

type Catalog interface {
	Status(context.Context) (Status, error)
	ListCharacters(context.Context, ListParams) (Page[CharacterSummary], error)
	ListWeapons(context.Context, ListParams) (Page[WeaponSummary], error)
	ListArtifactSets(context.Context, ListParams) (Page[ArtifactSetSummary], error)
	ListTalents(context.Context, ListParams) (Page[TalentSummary], error)
	ListContent(context.Context, string, ListParams) (Page[ContentSummary], error)
}

type Handler struct {
	catalog Catalog
}

type problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance"`
}

func NewHandler(catalog Catalog) *Handler {
	return &Handler{catalog: catalog}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET "+apiBase, h.index)
	mux.HandleFunc("GET "+apiBase+"/", h.index)
	mux.HandleFunc("GET "+apiBase+"/status", h.status)
	mux.HandleFunc("GET "+apiBase+"/characters", h.characters)
	mux.HandleFunc("GET "+apiBase+"/weapons", h.weapons)
	mux.HandleFunc("GET "+apiBase+"/artifact-sets", h.artifactSets)
	mux.HandleFunc("GET "+apiBase+"/talents", h.talents)
	mux.HandleFunc("GET "+apiBase+"/content/{category}", h.content)
}

func (h *Handler) index(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != apiBase && r.URL.Path != apiBase+"/" {
		writeProblem(w, r, http.StatusNotFound, "not-found", "Not Found", "The requested Genshin Impact resource does not exist.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"version": "v1",
		"status":  apiBase + "/status",
		"resources": map[string]string{
			"characters":   apiBase + "/characters",
			"weapons":      apiBase + "/weapons",
			"artifactSets": apiBase + "/artifact-sets",
			"talents":      apiBase + "/talents",
			"content":      apiBase + "/content/{category}",
		},
		"locales": []string{"en_US", "ru_RU"},
	})
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	status, err := h.catalog.Status(r.Context())
	if err != nil {
		slog.Error("read genshin catalog status", "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "catalog-unavailable", "Catalog unavailable", "The Genshin Impact catalog could not be read. Retry later.")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) characters(w http.ResponseWriter, r *http.Request) {
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	if params.Element != "" && !validElement(params.Element) {
		writeProblem(w, r, http.StatusBadRequest, "invalid-element", "Invalid element", "Element must be one of none, anemo, geo, electro, dendro, hydro, pyro or cryo.")
		return
	}
	if params.WeaponType != "" && !validWeaponType(params.WeaponType) {
		writeProblem(w, r, http.StatusBadRequest, "invalid-weapon-type", "Invalid weapon type", "Weapon type must be sword, claymore, polearm, bow or catalyst.")
		return
	}
	page, err := h.catalog.ListCharacters(r.Context(), params)
	handlePage(w, r, page, err)
}

func (h *Handler) weapons(w http.ResponseWriter, r *http.Request) {
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	if params.WeaponType != "" && !validWeaponType(params.WeaponType) {
		writeProblem(w, r, http.StatusBadRequest, "invalid-weapon-type", "Invalid weapon type", "Weapon type must be sword, claymore, polearm, bow or catalyst.")
		return
	}
	page, err := h.catalog.ListWeapons(r.Context(), params)
	handlePage(w, r, page, err)
}

func (h *Handler) artifactSets(w http.ResponseWriter, r *http.Request) {
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	page, err := h.catalog.ListArtifactSets(r.Context(), params)
	handlePage(w, r, page, err)
}

func (h *Handler) talents(w http.ResponseWriter, r *http.Request) {
	params, ok := parseListParams(w, r)
	if !ok {
		return
	}
	page, err := h.catalog.ListTalents(r.Context(), params)
	handlePage(w, r, page, err)
}

func (h *Handler) content(w http.ResponseWriter, r *http.Request) {
	category := r.PathValue("category")
	if !contentCategoryValue.MatchString(category) {
		writeProblem(w, r, http.StatusBadRequest, "invalid-category", "Invalid category", "Category must contain only lowercase letters and numbers.")
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
	query := r.URL.Query()
	params := ListParams{
		Locale:     query.Get("locale"),
		Query:      strings.TrimSpace(query.Get("q")),
		Cursor:     query.Get("cursor"),
		Element:    strings.ToLower(query.Get("element")),
		WeaponType: strings.ToLower(query.Get("weaponType")),
		Limit:      24,
	}
	if params.Locale == "" {
		params.Locale = "en_US"
	}
	if params.Locale != "en_US" && params.Locale != "ru_RU" {
		writeProblem(w, r, http.StatusBadRequest, "invalid-locale", "Invalid locale", "Locale must be en_US or ru_RU.")
		return ListParams{}, false
	}
	if len(params.Query) > 200 {
		writeProblem(w, r, http.StatusBadRequest, "invalid-query", "Invalid search query", "Search query must not exceed 200 characters.")
		return ListParams{}, false
	}
	if rawLimit := query.Get("limit"); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil || limit < 1 || limit > 100 {
			writeProblem(w, r, http.StatusBadRequest, "invalid-limit", "Invalid limit", "Limit must be between 1 and 100.")
			return ListParams{}, false
		}
		params.Limit = limit
	}
	if rawRarity := query.Get("rarity"); rawRarity != "" {
		rarity, err := strconv.Atoi(rawRarity)
		if err != nil || rarity < 1 || rarity > 5 {
			writeProblem(w, r, http.StatusBadRequest, "invalid-rarity", "Invalid rarity", "Rarity must be between 1 and 5.")
			return ListParams{}, false
		}
		params.Rarity = rarity
	}
	if _, err := decodeCursor(params.Cursor); err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid-cursor", "Invalid cursor", "Use the opaque nextCursor value returned by the previous response.")
		return ListParams{}, false
	}
	return params, true
}

func handlePage[T any](w http.ResponseWriter, r *http.Request, page Page[T], err error) {
	if errors.Is(err, ErrInvalidCursor) {
		writeProblem(w, r, http.StatusBadRequest, "invalid-cursor", "Invalid cursor", "Use the opaque nextCursor value returned by the previous response.")
		return
	}
	if err != nil {
		slog.Error("read genshin catalog collection", "path", r.URL.Path, "error", err)
		writeProblem(w, r, http.StatusServiceUnavailable, "catalog-unavailable", "Catalog unavailable", "The Genshin Impact catalog could not be read. Retry later.")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func validElement(value string) bool {
	switch value {
	case "none", "anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo":
		return true
	default:
		return false
	}
}

func validWeaponType(value string) bool {
	switch value {
	case "sword", "claymore", "polearm", "bow", "catalyst":
		return true
	default:
		return false
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("encode genshin response", "error", err)
	}
}

func writeProblem(w http.ResponseWriter, r *http.Request, status int, problemType, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(problem{
		Type:     "https://api.gildra.net/errors/genshin-impact/" + problemType,
		Title:    title,
		Status:   status,
		Detail:   detail,
		Instance: r.URL.Path,
	}); err != nil {
		slog.Warn("encode genshin problem", "error", err)
	}
}
