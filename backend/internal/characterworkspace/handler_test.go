package characterworkspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeVerifier struct {
	subject string
	err     error
	token   string
	region  string
}

func (f *fakeVerifier) Verify(_ context.Context, token, region string) (string, error) {
	f.token = token
	f.region = region
	return f.subject, f.err
}

type fakeAPI struct {
	subject         string
	scope           Scope
	write           WriteInput
	migration       MigrationInput
	documents       []Document
	document        Document
	migrationResult MigrationResult
	runs            []RunRecord
	run             RunRecord
	share           ShareCreated
	public          PublicRun
	runInput        CreateRunInput
	err             error
}

func (f *fakeAPI) List(_ context.Context, subject string, scope Scope) ([]Document, error) {
	f.subject = subject
	f.scope = scope
	return f.documents, f.err
}
func (f *fakeAPI) Put(_ context.Context, subject string, scope Scope, input WriteInput) (Document, error) {
	f.subject = subject
	f.scope = scope
	f.write = input
	return f.document, f.err
}
func (f *fakeAPI) Delete(_ context.Context, subject string, scope Scope, kind string, revision int64, mutation string) (Document, error) {
	f.subject = subject
	f.scope = scope
	f.write = WriteInput{Kind: kind, ExpectedRevision: revision, MutationID: mutation}
	return f.document, f.err
}
func (f *fakeAPI) Migrate(_ context.Context, subject string, scope Scope, input MigrationInput) (MigrationResult, error) {
	f.subject = subject
	f.scope = scope
	f.migration = input
	return f.migrationResult, f.err
}
func (f *fakeAPI) CreateRun(_ context.Context, subject string, scope Scope, input CreateRunInput) (RunRecord, error) {
	f.subject, f.scope = subject, scope
	f.runInput = input
	return f.run, f.err
}
func (f *fakeAPI) ListRuns(_ context.Context, subject string, scope Scope, _ string) ([]RunRecord, error) {
	f.subject, f.scope = subject, scope
	return f.runs, f.err
}
func (f *fakeAPI) CreateShare(_ context.Context, subject string, scope Scope, _ uuid.UUID) (ShareCreated, error) {
	f.subject, f.scope = subject, scope
	return f.share, f.err
}
func (f *fakeAPI) RevokeShare(_ context.Context, subject string, scope Scope, _ uuid.UUID) error {
	f.subject, f.scope = subject, scope
	return f.err
}
func (f *fakeAPI) PublicShare(_ context.Context, _ string) (PublicRun, error) { return f.public, f.err }

func workspaceRequest(method, path, body string) *http.Request {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer access-token")
	request.Header.Set("X-BattleNet-Region", "eu")
	return request
}

func TestWorkspaceRejectsMissingSession(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeAPI{}, &fakeVerifier{err: errors.New("invalid")}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/wow/workspace?character=eu--realm--hero&specialization=fury-warrior", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", response.Code)
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("private response must not be cached")
	}
}

func TestWorkspaceUsesVerifiedSubjectAndScope(t *testing.T) {
	api := &fakeAPI{documents: []Document{{Kind: "talent-builds", Payload: json.RawMessage(`[]`), Revision: 2, UpdatedAt: time.Now()}}}
	verifier := &fakeVerifier{subject: "verified-battlenet-sub"}
	mux := http.NewServeMux()
	NewHandler(api, verifier).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, workspaceRequest(http.MethodGet, "/v1/wow/workspace?character=eu--realm--hero&specialization=fury-warrior", ""))
	if response.Code != http.StatusOK || api.subject != "verified-battlenet-sub" {
		t.Fatalf("status=%d subject=%q", response.Code, api.subject)
	}
	if api.scope.CharacterSlug != "eu--realm--hero" || api.scope.SpecializationSlug != "fury-warrior" {
		t.Fatalf("scope=%+v", api.scope)
	}
	if verifier.token != "access-token" || verifier.region != "eu" {
		t.Fatalf("token forwarding failed")
	}
}

func TestWorkspacePutReturnsRevisionConflictWithoutOverwrite(t *testing.T) {
	current := Document{Kind: "rotation-studio", Payload: json.RawMessage(`{"server":true}`), Revision: 4, UpdatedAt: time.Now()}
	api := &fakeAPI{document: current, err: ErrConflict}
	mux := http.NewServeMux()
	NewHandler(api, &fakeVerifier{subject: "account"}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, workspaceRequest(http.MethodPut, "/v1/wow/workspace/rotation-studio?character=eu--realm--hero&specialization=fury-warrior", `{"payload":{"client":true},"expectedRevision":3,"mutationId":"mutation-123"}`))
	if response.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"revision":4`) || !strings.Contains(response.Body.String(), `"server":true`) {
		t.Fatalf("missing current document: %s", response.Body.String())
	}
}

func TestWorkspaceMigrationForwardsIdempotencyKey(t *testing.T) {
	api := &fakeAPI{migrationResult: MigrationResult{ImportedDocuments: 1}}
	mux := http.NewServeMux()
	NewHandler(api, &fakeVerifier{subject: "account"}).Register(mux)
	body := `{"migrationKey":"local-v2-eu-realm-hero","documents":[{"kind":"talent-builds","payload":[{"id":"one"}],"mutationId":"migration-doc-1"}]}`
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, workspaceRequest(http.MethodPost, "/v1/wow/workspace/migrate?character=eu--realm--hero&specialization=fury-warrior", body))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if api.migration.MigrationKey != "local-v2-eu-realm-hero" || len(api.migration.Documents) != 1 {
		t.Fatalf("migration=%+v", api.migration)
	}
}

func TestWorkspaceRejectsInvalidScopeBeforeStore(t *testing.T) {
	api := &fakeAPI{}
	mux := http.NewServeMux()
	NewHandler(api, &fakeVerifier{subject: "account"}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, workspaceRequest(http.MethodGet, "/v1/wow/workspace?character=../../other&specialization=fury-warrior", ""))
	if response.Code != http.StatusBadRequest || api.subject != "" {
		t.Fatalf("status=%d store subject=%q", response.Code, api.subject)
	}
}

func TestBattleNetVerifierUsesBearerAndSubject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("authorization=%q", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"sub":"battle-account-42"}`))
	}))
	defer server.Close()
	verifier := &BattleNetVerifier{client: server.Client(), endpoints: map[string]string{"eu": server.URL}}
	subject, err := verifier.Verify(context.Background(), "token", "eu")
	if err != nil || subject != "battle-account-42" {
		t.Fatalf("subject=%q err=%v", subject, err)
	}
}

func TestHistoryRejectsUnknownOrUnverifiedInput(t *testing.T) {
	api := &fakeAPI{}
	mux := http.NewServeMux()
	NewHandler(api, &fakeVerifier{subject: "account"}).Register(mux)
	response := httptest.NewRecorder()
	body := `{"clientRunId":"run-12345678","kind":"rotation","gameBuild":"12.1","profileFingerprint":"abc123","scenario":{"id":"aoe","durationSeconds":120,"targets":5},"engine":"SimulationCraft","metrics":{"dps":120000},"label":"AoE","armoryPayload":{"private":true}}`
	mux.ServeHTTP(response, workspaceRequest(http.MethodPost, "/v1/wow/workspace/history?character=eu--realm--hero&specialization=fury-warrior", body))
	if response.Code != http.StatusBadRequest || api.runInput.ClientRunID != "" {
		t.Fatalf("unknown private property accepted: status=%d input=%+v", response.Code, api.runInput)
	}
}

func TestPublicShareDoesNotRequireBattleNetSession(t *testing.T) {
	api := &fakeAPI{public: PublicRun{SchemaVersion: 1, Kind: "rotation", SpecializationSlug: "fury-warrior", GameBuild: "12.1", Scenario: RunScenario{ID: "aoe", DurationSeconds: 120, Targets: 5}, Engine: "SimulationCraft", Metrics: RunMetrics{DPS: float64Pointer(123456)}, Label: "AoE", CreatedAt: time.Now()}}
	mux := http.NewServeMux()
	NewHandler(api, &fakeVerifier{err: errors.New("must not be called")}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/wow/shared/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	for _, forbidden := range []string{"accountSubject", "characterSlug", "accessToken", "armoryPayload"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("public payload leaked %q: %s", forbidden, body)
		}
	}
}

func float64Pointer(value float64) *float64 { return &value }
