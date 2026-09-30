package characterworkspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestWorkspacePersistenceIsolationMigrationAndConflict(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	database, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	service := NewService(database)
	suffix := time.Now().UnixNano()
	subject := fmt.Sprintf("workspace-test-%d", suffix)
	otherSubject := fmt.Sprintf("workspace-other-%d", suffix)
	scope := Scope{CharacterSlug: fmt.Sprintf("eu--qa--hero-%d", suffix), SpecializationSlug: "fury-warrior"}
	hash, _ := accountHash(subject)
	defer func() {
		_, _ = database.Exec(context.Background(), `DELETE FROM wow_character_workspace_documents WHERE account_subject_hash=$1`, hash[:])
		_, _ = database.Exec(context.Background(), `DELETE FROM wow_character_workspace_migrations WHERE account_subject_hash=$1`, hash[:])
	}()

	migration := MigrationInput{MigrationKey: fmt.Sprintf("migration-%d", suffix), Documents: []WriteInput{{Kind: "talent-builds", Payload: json.RawMessage(`[{"id":"build-1","name":"Raid"}]`), MutationID: fmt.Sprintf("mutation-%d", suffix)}}}
	first, err := service.Migrate(ctx, subject, scope, migration)
	if err != nil {
		t.Fatal(err)
	}
	if first.AlreadyImported || first.ImportedDocuments != 1 || len(first.Documents) != 1 {
		t.Fatalf("first migration=%+v", first)
	}
	second, err := service.Migrate(ctx, subject, scope, migration)
	if err != nil {
		t.Fatal(err)
	}
	if !second.AlreadyImported || second.ImportedDocuments != 0 || len(second.Documents) != 1 {
		t.Fatalf("repeat migration=%+v", second)
	}
	isolated, err := service.List(ctx, otherSubject, scope)
	if err != nil {
		t.Fatal(err)
	}
	if len(isolated) != 0 {
		t.Fatalf("other account can see %d documents", len(isolated))
	}

	updated, err := service.Put(ctx, subject, scope, WriteInput{Kind: "talent-builds", Payload: json.RawMessage(`[{"id":"build-1","name":"Mythic+"}]`), ExpectedRevision: 1, MutationID: fmt.Sprintf("update-%d", suffix)})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 2 {
		t.Fatalf("revision=%d", updated.Revision)
	}
	current, err := service.Put(ctx, subject, scope, WriteInput{Kind: "talent-builds", Payload: json.RawMessage(`[]`), ExpectedRevision: 1, MutationID: fmt.Sprintf("stale-%d", suffix)})
	var currentBuilds []map[string]any
	_ = json.Unmarshal(current.Payload, &currentBuilds)
	if !errors.Is(err, ErrConflict) || current.Revision != 2 || len(currentBuilds) != 1 || currentBuilds[0]["name"] != "Mythic+" {
		t.Fatalf("conflict current=%+v err=%v", current, err)
	}

	deleted, err := service.Delete(ctx, subject, scope, "talent-builds", 2, fmt.Sprintf("delete-%d", suffix))
	if err != nil {
		t.Fatal(err)
	}
	if deleted.Revision != 3 {
		t.Fatalf("deleted revision=%d", deleted.Revision)
	}
	documents, err := service.List(ctx, subject, scope)
	if err != nil {
		t.Fatal(err)
	}
	if len(documents) != 0 {
		t.Fatalf("deleted document is still listed")
	}
	var versions int
	if err := database.QueryRow(ctx, `SELECT count(*) FROM wow_character_workspace_versions version JOIN wow_character_workspace_documents document ON document.id=version.document_id WHERE document.account_subject_hash=$1`, hash[:]).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if versions != 3 {
		t.Fatalf("versions=%d want 3", versions)
	}
}

func TestCharacterHistoryStalenessShareIsolationAndRevoke(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	database, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	service := NewService(database)
	suffix := time.Now().UnixNano()
	subject := fmt.Sprintf("history-owner-%d", suffix)
	other := fmt.Sprintf("history-other-%d", suffix)
	scope := Scope{CharacterSlug: fmt.Sprintf("eu--qa--history-%d", suffix), SpecializationSlug: "fury-warrior"}
	hash, _ := accountHash(subject)
	defer func() {
		_, _ = database.Exec(context.Background(), `DELETE FROM wow_character_run_history WHERE account_subject_hash=$1`, hash[:])
	}()
	dps, delta, confidence, iterations := 123456.0, 2.5, 95.0, 1000
	input := CreateRunInput{ClientRunID: fmt.Sprintf("run-%d", suffix), Kind: "rotation", GameBuild: "12.1.0.70000", ProfileFingerprint: "fingerprint-before", Scenario: RunScenario{ID: "aoe", DurationSeconds: 120, Targets: 5}, Engine: "SimulationCraft 1100", Metrics: RunMetrics{DPS: &dps, DeltaPercent: &delta, Confidence: &confidence, Iterations: &iterations}, Label: "Rotation AoE"}
	record, err := service.CreateRun(ctx, subject, scope, input)
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := service.CreateRun(ctx, subject, scope, input)
	if err != nil || duplicate.ID != record.ID {
		t.Fatalf("idempotency duplicate=%s record=%s err=%v", duplicate.ID, record.ID, err)
	}
	fresh, err := service.ListRuns(ctx, subject, scope, "fingerprint-before")
	if err != nil || len(fresh) != 1 || fresh[0].Stale {
		t.Fatalf("fresh=%+v err=%v", fresh, err)
	}
	stale, err := service.ListRuns(ctx, subject, scope, "fingerprint-after")
	if err != nil || len(stale) != 1 || !stale[0].Stale {
		t.Fatalf("stale=%+v err=%v", stale, err)
	}
	if isolated, err := service.ListRuns(ctx, other, scope, "fingerprint-before"); err != nil || len(isolated) != 0 {
		t.Fatalf("isolation=%+v err=%v", isolated, err)
	}
	if _, err := service.CreateShare(ctx, other, scope, record.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other owner share err=%v", err)
	}
	share, err := service.CreateShare(ctx, subject, scope, record.ID)
	if err != nil || len(share.Token) != 43 {
		t.Fatalf("share=%+v err=%v", share, err)
	}
	sharedHistory, err := service.ListRuns(ctx, subject, scope, "fingerprint-before")
	if err != nil || len(sharedHistory) != 1 || sharedHistory[0].ActiveShareID == nil || *sharedHistory[0].ActiveShareID != share.ID {
		t.Fatalf("active share missing from history: runs=%+v err=%v", sharedHistory, err)
	}
	public, err := service.PublicShare(ctx, share.Token)
	if err != nil || public.Kind != input.Kind || public.SpecializationSlug != scope.SpecializationSlug || public.Metrics.DPS == nil {
		t.Fatalf("public=%+v err=%v", public, err)
	}
	serialized, _ := json.Marshal(public)
	for _, forbidden := range []string{subject, scope.CharacterSlug, "account_subject_hash", "access_token", "armory"} {
		if strings.Contains(strings.ToLower(string(serialized)), strings.ToLower(forbidden)) {
			t.Fatalf("public payload leaked %q: %s", forbidden, serialized)
		}
	}
	if err := service.RevokeShare(ctx, other, scope, share.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other owner revoked share: %v", err)
	}
	if err := service.RevokeShare(ctx, subject, scope, share.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.PublicShare(ctx, share.Token); !errors.Is(err, ErrShareGone) {
		t.Fatalf("revoked share err=%v", err)
	}
}
