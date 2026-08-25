package catalogbackup

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
)

func TestRunnerEncryptsUploadsRestoresComparesAndSigns(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	state := completeState(69, 4)
	database := &fakeDatabase{source: state, restore: state, archive: []byte("real PostgreSQL custom archive")}
	store := newMemoryStore("r2://gildra-backups/")
	manifests := &memoryManifests{}
	clock := sequenceClock(time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC))
	seed := bytes.Repeat([]byte{7}, ed25519.SeedSize)

	result, err := (Runner{Database: database, Store: store, Manifests: manifests, Now: clock}).Run(
		context.Background(), Options{
			SourceDatabaseURL:  "postgres://backup:source-secret@source.internal:5432/gildra",
			RestoreDatabaseURL: "postgres://backup:restore-secret@restore.internal:5432/gildra_restore",
			Product:            "wow", ObjectPrefix: "catalog", TempDirectory: t.TempDir(),
			Recipient: identity.Recipient(), Identity: identity,
			SigningKey: ed25519.NewKeyFromSeed(seed),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !result.RestoreVerified || !result.SourceRestoreMatch || result.DatabaseVersion != 69 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if manifests.status != "verified" || manifests.failed != "" {
		t.Fatalf("manifest status = %q, failure = %q", manifests.status, manifests.failed)
	}
	artifact := store.objects[store.keyBySuffix(".dump.age")]
	if bytes.Contains(artifact, database.archive) || !bytes.HasPrefix(artifact, []byte("age-encryption.org/")) {
		t.Fatal("uploaded artifact is not an age-encrypted archive")
	}
	if !bytes.Equal(database.restored, database.archive) {
		t.Fatalf("restored archive = %q, want %q", database.restored, database.archive)
	}
	var evidence SignedEvidence
	if err := json.Unmarshal(store.objects[store.keyBySuffix(".manifest.json")], &evidence); err != nil {
		t.Fatal(err)
	}
	trustedKey := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	if err := VerifyEvidence(evidence, trustedKey); err != nil {
		t.Fatalf("verify signed evidence: %v", err)
	}
	if evidence.Evidence.SHA256 != result.SHA256 || evidence.Evidence.Source.Counts["game_entities"] != 4 {
		t.Fatalf("unexpected evidence: %#v", evidence.Evidence)
	}
	if !bytes.Contains(manifests.verification, []byte(`"restore_verified":true`)) ||
		!bytes.Contains(manifests.verification, []byte(`"source_restore_match":true`)) {
		t.Fatalf("database verification = %s", manifests.verification)
	}
}

func TestRunnerRejectsRestoreMismatchAndKeepsLastGoodDataUntouched(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	source := completeState(69, 10)
	restore := completeState(69, 10)
	restore.Counts["game_entities"] = 9
	database := &fakeDatabase{source: source, restore: restore, archive: []byte("archive")}
	store := newMemoryStore("s3://gildra-backups/")
	manifests := &memoryManifests{}
	_, err = (Runner{Database: database, Store: store, Manifests: manifests}).Run(context.Background(), Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db",
		Product: "wow", TempDirectory: t.TempDir(), Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{3}, ed25519.SeedSize)),
	})
	if err == nil || !strings.Contains(err.Error(), "critical count mismatch for game_entities") {
		t.Fatalf("error = %v, want critical count mismatch", err)
	}
	if manifests.status != "failed" || !strings.Contains(manifests.failed, "critical count mismatch") {
		t.Fatalf("manifest status = %q, failure = %q", manifests.status, manifests.failed)
	}
	if key := store.keyBySuffix(".manifest.json"); key != "" {
		t.Fatalf("signed evidence was uploaded for a failed restore: %s", key)
	}
}

func TestRunnerFailsClosedWhenRemoteObjectIsChanged(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	state := completeState(69, 1)
	store := newMemoryStore("r2://gildra-backups/")
	store.tamperDownload = true
	manifests := &memoryManifests{}
	_, err = (Runner{
		Database: &fakeDatabase{source: state, restore: state, archive: []byte("archive")},
		Store:    store, Manifests: manifests,
	}).Run(context.Background(), Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db",
		Product: "wow", TempDirectory: t.TempDir(), Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{5}, ed25519.SeedSize)),
	})
	if err == nil {
		t.Fatal("tampered remote object was accepted")
	}
	if manifests.status != "failed" {
		t.Fatalf("manifest status = %q, want failed", manifests.status)
	}
}

func TestOptionsRejectSourceAsRestoreTarget(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	options := Options{
		SourceDatabaseURL: "postgres://user:one@db:5432/gildra", RestoreDatabaseURL: "postgres://user:two@db:5432/gildra",
		Product: "wow", Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{1}, ed25519.SeedSize)),
	}
	if err := options.Validate(); err == nil || !strings.Contains(err.Error(), "must be separate") {
		t.Fatalf("Validate() error = %v, want separate database rejection", err)
	}
}

func TestOptionsRejectMismatchedAgeKeys(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	otherIdentity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	options := Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db", Product: "wow",
		Recipient: identity.Recipient(), Identity: otherIdentity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{1}, ed25519.SeedSize)),
	}
	if err := options.Validate(); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("Validate() error = %v, want age key mismatch", err)
	}
}

type fakeDatabase struct {
	source   State
	restore  State
	archive  []byte
	restored []byte
}

func (f *fakeDatabase) SnapshotAndDump(_ context.Context, _ string, destination io.Writer) (State, error) {
	_, err := destination.Write(f.archive)
	return f.source, err
}

func (f *fakeDatabase) RestoreAndInspect(_ context.Context, _ string, source io.Reader) (State, error) {
	data, err := io.ReadAll(source)
	if err != nil {
		return State{}, err
	}
	f.restored = data
	return f.restore, nil
}

type memoryStore struct {
	base           string
	objects        map[string][]byte
	tamperDownload bool
}

func newMemoryStore(base string) *memoryStore {
	return &memoryStore{base: base, objects: make(map[string][]byte)}
}

func (m *memoryStore) URI(key string) string { return m.base + key }

func (m *memoryStore) Put(_ context.Context, key string, source io.Reader, size int64, _ string, _ map[string]string) error {
	data, err := io.ReadAll(source)
	if err != nil {
		return err
	}
	if int64(len(data)) != size {
		return errors.New("unexpected upload size")
	}
	m.objects[key] = data
	return nil
}

func (m *memoryStore) Get(_ context.Context, key string) (StoredObject, error) {
	data, ok := m.objects[key]
	if !ok {
		return StoredObject{}, errors.New("object not found")
	}
	copyOfData := append([]byte(nil), data...)
	if m.tamperDownload && len(copyOfData) > 32 {
		copyOfData[len(copyOfData)/2] ^= 0xff
	}
	return StoredObject{Body: io.NopCloser(bytes.NewReader(copyOfData)), Size: int64(len(copyOfData))}, nil
}

func (m *memoryStore) keyBySuffix(suffix string) string {
	for key := range m.objects {
		if strings.HasSuffix(key, suffix) {
			return key
		}
	}
	return ""
}

type memoryManifests struct {
	id           uuid.UUID
	status       string
	failed       string
	verification []byte
}

func (m *memoryManifests) Create(_ context.Context, start ManifestStart) error {
	m.id, m.status = start.ID, "creating"
	return nil
}

func (m *memoryManifests) MarkCreated(_ context.Context, id uuid.UUID, _ ManifestCreated) error {
	if id != m.id {
		return errors.New("manifest ID mismatch")
	}
	m.status = "created"
	return nil
}

func (m *memoryManifests) MarkVerifying(_ context.Context, id uuid.UUID, _ time.Time) error {
	if id != m.id {
		return errors.New("manifest ID mismatch")
	}
	m.status = "verifying"
	return nil
}

func (m *memoryManifests) MarkVerified(_ context.Context, id uuid.UUID, verified ManifestVerified) error {
	if id != m.id {
		return errors.New("manifest ID mismatch")
	}
	m.status = "verified"
	m.verification = append([]byte(nil), verified.Verification...)
	return nil
}

func (m *memoryManifests) MarkFailed(_ context.Context, id uuid.UUID, summary string) error {
	if id != m.id {
		return errors.New("manifest ID mismatch")
	}
	m.status, m.failed = "failed", summary
	return nil
}

func completeState(version, count int64) State {
	state := State{DatabaseVersion: version, Counts: make(map[string]int64, len(CriticalTables))}
	for _, table := range CriticalTables {
		state.Counts[table] = count
	}
	return state
}

func sequenceClock(start time.Time) func() time.Time {
	current := start.Add(-time.Second)
	return func() time.Time {
		current = current.Add(time.Second)
		return current
	}
}
