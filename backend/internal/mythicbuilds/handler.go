package mythicbuilds

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/httpjson"
	"github.com/google/uuid"
)

type API interface {
	List(context.Context, string) ([]Build, error)
	Put(context.Context, string, Input) (bool, error)
	Delete(context.Context, string, uuid.UUID, DeleteInput) error
	Import(context.Context, string, []Input) error
}

// IdentityVerifier resolves the signed-in Battle.net account; cmd/server passes
// the characterworkspace verifier, so this package does not import it.
type IdentityVerifier interface {
	Verify(context.Context, string, string) (string, error)
}

type Handler struct {
	api      API
	verifier IdentityVerifier
}

func NewHandler(api API, verifier IdentityVerifier) *Handler {
	return &Handler{api: api, verifier: verifier}
}
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/wow/mythic-builds", h.serve)
	mux.HandleFunc("PUT /v1/wow/mythic-builds/{id}", h.serve)
	mux.HandleFunc("DELETE /v1/wow/mythic-builds/{id}", h.serve)
	mux.HandleFunc("POST /v1/wow/mythic-builds/import", h.serve)
}
func (h *Handler) serve(w http.ResponseWriter, r *http.Request) {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		reply(w, 401, map[string]any{"code": "session_expired"})
		return
	}
	subject, err := h.verifier.Verify(r.Context(), strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")), r.Header.Get("X-BattleNet-Region"))
	if err != nil {
		reply(w, 401, map[string]any{"code": "session_expired"})
		return
	}
	key, err := OwnerKey(subject)
	if err != nil {
		reply(w, 401, map[string]any{"code": "session_expired"})
		return
	}
	// Authenticated identity is always server-derived. The header only rejects stale UI from a different session.
	if r.Method != "GET" && r.Header.Get("X-Mythic-Account") != key {
		reply(w, 409, map[string]any{"code": "account_changed"})
		return
	}
	duplicate := false
	switch r.Method {
	case "PUT":
		id, e := uuid.Parse(r.PathValue("id"))
		var input Input
		if e != nil || !decode(w, r, &input) || (input.ID != uuid.Nil && input.ID != id) {
			reply(w, 400, map[string]any{"code": "invalid"})
			return
		}
		input.ID = id
		duplicate, err = h.api.Put(r.Context(), subject, input)
	case "DELETE":
		id, e := uuid.Parse(r.PathValue("id"))
		var input DeleteInput
		if e != nil || !decode(w, r, &input) {
			reply(w, 400, map[string]any{"code": "invalid"})
			return
		}
		err = h.api.Delete(r.Context(), subject, id, input)
	case "POST":
		var input ImportInput
		if !decode(w, r, &input) {
			reply(w, 400, map[string]any{"code": "invalid"})
			return
		}
		err = h.api.Import(r.Context(), subject, input.Builds)
	}
	status := 200
	code := ""
	switch {
	case errors.Is(err, ErrConflict):
		status = 409
		code = "conflict"
	case errors.Is(err, ErrLimit):
		status = 422
		code = "limit"
	case errors.Is(err, ErrInvalid):
		reply(w, 400, map[string]any{"code": "invalid"})
		return
	case err != nil:
		reply(w, 503, map[string]any{"code": "unavailable"})
		return
	}
	builds, e := h.api.List(r.Context(), subject)
	if e != nil {
		reply(w, 503, map[string]any{"code": "unavailable"})
		return
	}
	reply(w, status, map[string]any{"accountKey": key, "builds": builds, "code": code, "duplicate": duplicate})
}
func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	reader := http.MaxBytesReader(w, r.Body, 100<<10)
	decoder := json.NewDecoder(reader)
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil {
		return false
	}
	return decoder.Decode(&struct{}{}) == io.EOF
}
func reply(w http.ResponseWriter, status int, value any) {
	httpjson.Write(w, status, httpjson.PrivateNoStore, value)
}
