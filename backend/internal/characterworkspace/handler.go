package characterworkspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type API interface {
	List(context.Context, string, Scope) ([]Document, error)
	Put(context.Context, string, Scope, WriteInput) (Document, error)
	Delete(context.Context, string, Scope, string, int64, string) (Document, error)
	Migrate(context.Context, string, Scope, MigrationInput) (MigrationResult, error)
	CreateRun(context.Context, string, Scope, CreateRunInput) (RunRecord, error)
	ListRuns(context.Context, string, Scope, string) ([]RunRecord, error)
	CreateShare(context.Context, string, Scope, uuid.UUID) (ShareCreated, error)
	RevokeShare(context.Context, string, Scope, uuid.UUID) error
	PublicShare(context.Context, string) (PublicRun, error)
}

type IdentityVerifier interface {
	Verify(context.Context, string, string) (string, error)
}

type BattleNetVerifier struct {
	client    *http.Client
	endpoints map[string]string
}

func NewBattleNetVerifier() *BattleNetVerifier {
	return &BattleNetVerifier{client: &http.Client{Timeout: 5 * time.Second}, endpoints: map[string]string{
		"eu": "https://oauth.battle.net/userinfo", "us": "https://oauth.battle.net/userinfo",
		"kr": "https://oauth.battle.net/userinfo", "tw": "https://oauth.battle.net/userinfo",
		"cn": "https://www.battlenet.com.cn/oauth/userinfo",
	}}
}

func (v *BattleNetVerifier) Verify(ctx context.Context, token, region string) (string, error) {
	endpoint, ok := v.endpoints[strings.ToLower(strings.TrimSpace(region))]
	if !ok || strings.TrimSpace(token) == "" {
		return "", errors.New("invalid Battle.net credentials")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	response, err := v.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("verify Battle.net token: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return "", errors.New("invalid Battle.net credentials")
	}
	var identity struct {
		Subject string `json:"sub"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 32<<10)).Decode(&identity); err != nil || strings.TrimSpace(identity.Subject) == "" {
		return "", errors.New("invalid Battle.net identity")
	}
	return identity.Subject, nil
}

type Handler struct {
	api      API
	verifier IdentityVerifier
}

func NewHandler(api API, verifier IdentityVerifier) *Handler {
	return &Handler{api: api, verifier: verifier}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/wow/workspace", h.list)
	mux.HandleFunc("PUT /v1/wow/workspace/{kind}", h.put)
	mux.HandleFunc("DELETE /v1/wow/workspace/{kind}", h.delete)
	mux.HandleFunc("POST /v1/wow/workspace/migrate", h.migrate)
	mux.HandleFunc("GET /v1/wow/workspace/history", h.listHistory)
	mux.HandleFunc("POST /v1/wow/workspace/history", h.createHistory)
	mux.HandleFunc("POST /v1/wow/workspace/history/{run}/share", h.createShare)
	mux.HandleFunc("DELETE /v1/wow/workspace/shares/{share}", h.revokeShare)
	mux.HandleFunc("GET /v1/wow/shared/{token}", h.publicShare)
}

func (h *Handler) identity(r *http.Request) (string, bool) {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authorization, "Bearer ") {
		return "", false
	}
	subject, err := h.verifier.Verify(r.Context(), strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer ")), r.Header.Get("X-BattleNet-Region"))
	return subject, err == nil
}

func requestScope(r *http.Request) (Scope, error) {
	scope := Scope{CharacterSlug: r.URL.Query().Get("character"), SpecializationSlug: r.URL.Query().Get("specialization")}
	return scope, ValidateScope(scope)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	documents, err := h.api.List(r.Context(), subject, scope)
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "workspace_unavailable", "workspace is temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": documents})
}

type writeRequest struct {
	Payload          json.RawMessage `json:"payload"`
	ExpectedRevision int64           `json:"expectedRevision"`
	MutationID       string          `json:"mutationId"`
}

func decodeRequest(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 300<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request must contain one JSON value")
	}
	return nil
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	var body writeRequest
	if err := decodeRequest(w, r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid workspace document")
		return
	}
	document, err := h.api.Put(r.Context(), subject, scope, WriteInput{Kind: r.PathValue("kind"), Payload: body.Payload, ExpectedRevision: body.ExpectedRevision, MutationID: body.MutationID})
	if errors.Is(err, ErrConflict) {
		writeJSON(w, http.StatusConflict, map[string]any{"code": "revision_conflict", "current": document})
		return
	}
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_document", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, document)
}

type deleteRequest struct {
	ExpectedRevision int64  `json:"expectedRevision"`
	MutationID       string `json:"mutationId"`
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	var body deleteRequest
	if err := decodeRequest(w, r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid delete request")
		return
	}
	document, err := h.api.Delete(r.Context(), subject, scope, r.PathValue("kind"), body.ExpectedRevision, body.MutationID)
	if errors.Is(err, ErrConflict) {
		writeJSON(w, http.StatusConflict, map[string]any{"code": "revision_conflict", "current": document})
		return
	}
	if errors.Is(err, ErrNotFound) {
		writeProblem(w, http.StatusNotFound, "document_not_found", "workspace document not found")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_document", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, document)
}

type migrationRequest struct {
	MigrationKey string `json:"migrationKey"`
	Documents    []struct {
		Kind       string          `json:"kind"`
		Payload    json.RawMessage `json:"payload"`
		MutationID string          `json:"mutationId"`
	} `json:"documents"`
}

func (h *Handler) migrate(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	var body migrationRequest
	if err := decodeRequest(w, r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid migration request")
		return
	}
	input := MigrationInput{MigrationKey: body.MigrationKey, Documents: make([]WriteInput, 0, len(body.Documents))}
	for _, document := range body.Documents {
		input.Documents = append(input.Documents, WriteInput{Kind: document.Kind, Payload: document.Payload, MutationID: document.MutationID})
	}
	result, err := h.api.Migrate(r.Context(), subject, scope, input)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_migration", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) listHistory(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	fingerprint := strings.TrimSpace(r.URL.Query().Get("fingerprint"))
	if !fingerprintPattern.MatchString(fingerprint) {
		writeProblem(w, http.StatusBadRequest, "invalid_history_request", "invalid current fingerprint")
		return
	}
	runs, err := h.api.ListRuns(r.Context(), subject, scope, fingerprint)
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "history_unavailable", "history is temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

func (h *Handler) createHistory(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_scope", err.Error())
		return
	}
	var input CreateRunInput
	if err := decodeRequest(w, r, &input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "invalid history record")
		return
	}
	if err := ValidateCreateRun(input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_history_record", err.Error())
		return
	}
	record, err := h.api.CreateRun(r.Context(), subject, scope, input)
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "history_unavailable", "history is temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, record)
}

func (h *Handler) createShare(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	runID, idErr := uuid.Parse(r.PathValue("run"))
	if err != nil || idErr != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_share_request", "invalid share target")
		return
	}
	share, err := h.api.CreateShare(r.Context(), subject, scope, runID)
	if errors.Is(err, ErrNotFound) {
		writeProblem(w, http.StatusNotFound, "history_not_found", "history record not found")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "share_unavailable", "share is temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, share)
}

func (h *Handler) revokeShare(w http.ResponseWriter, r *http.Request) {
	subject, ok := h.identity(r)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "invalid_session", "Battle.net session is invalid or expired")
		return
	}
	scope, err := requestScope(r)
	shareID, idErr := uuid.Parse(r.PathValue("share"))
	if err != nil || idErr != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_share_request", "invalid share target")
		return
	}
	err = h.api.RevokeShare(r.Context(), subject, scope, shareID)
	if errors.Is(err, ErrNotFound) {
		writeProblem(w, http.StatusNotFound, "share_not_found", "share not found")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "share_unavailable", "share is temporarily unavailable")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) publicShare(w http.ResponseWriter, r *http.Request) {
	result, err := h.api.PublicShare(r.Context(), r.PathValue("token"))
	if errors.Is(err, ErrShareGone) {
		writeProblem(w, http.StatusNotFound, "share_unavailable", "shared result is unavailable")
		return
	}
	if err != nil {
		writeProblem(w, http.StatusServiceUnavailable, "share_unavailable", "shared result is temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeProblem(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
