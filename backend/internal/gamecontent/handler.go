package gamecontent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

type Reader interface {
	Catalog(context.Context, Context) (Release, error)
	Snapshot(context.Context, string, string) (Snapshot, error)
}

type Handler struct{ reader Reader }

func NewHandler(reader Reader) *Handler { return &Handler{reader: reader} }
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/game-content/wow/{edition}/catalog", h.catalog)
	mux.HandleFunc("GET /v1/game-content/releases/{release}/{module}", h.snapshot)
}

func (h *Handler) catalog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	for key := range q {
		if key != "channel" && key != "region" && key != "progressionKind" && key != "progressionId" {
			problem(w, http.StatusBadRequest, "invalid_context")
			return
		}
		if len(q[key]) != 1 {
			problem(w, http.StatusBadRequest, "invalid_context")
			return
		}
	}
	c := Context{Game: "wow", Edition: r.PathValue("edition"), Channel: "live", Region: "global", ProgressionKind: "none"}
	if q.Has("channel") {
		c.Channel = q.Get("channel")
	}
	if q.Has("region") {
		c.Region = q.Get("region")
	}
	if q.Has("progressionKind") {
		c.ProgressionKind = q.Get("progressionKind")
	}
	if q.Has("progressionId") {
		id := q.Get("progressionId")
		c.ProgressionID = &id
	}
	if c.Validate() != nil {
		problem(w, http.StatusBadRequest, "invalid_context")
		return
	}
	if c.Channel != "live" {
		problem(w, http.StatusNotFound, "content_not_found")
		return
	}
	result, err := h.reader.Catalog(r.Context(), c)
	if err != nil {
		readError(w, err)
		return
	}
	// The generation is part of the ETag: rollback and visibility changes must
	// be observed even when the content hash is identical to an older release.
	writeJSON(w, r, result, "public, max-age=0, s-maxage=60")
}

func (h *Handler) snapshot(w http.ResponseWriter, r *http.Request) {
	result, err := h.reader.Snapshot(r.Context(), r.PathValue("release"), r.PathValue("module"))
	if err != nil {
		readError(w, err)
		return
	}
	writeJSON(w, r, result, "public, max-age=0, s-maxage=60")
}

func writeJSON(w http.ResponseWriter, r *http.Request, value any, cache string) {
	raw, err := json.Marshal(value)
	if err != nil {
		problem(w, 500, "content_unavailable")
		return
	}
	etag := `"` + digest(raw) + `"`
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", cache)
	w.Header().Set("ETag", etag)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(raw)
}

func readError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		problem(w, 404, "content_not_found")
		return
	}
	problem(w, 503, "content_unavailable")
}
func problem(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "code": code})
}
