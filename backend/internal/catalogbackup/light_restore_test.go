package catalogbackup

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"filippo.io/age"
)

const sampleTOC = `;
; Archive created at 2026-10-23 10:00:00 UTC
;     dbname: gildra
100; 1259 16401 TABLE public users gildra
200; 0 16401 TABLE DATA public users gildra
201; 0 16410 TABLE DATA public game_entities gildra
202; 0 16420 TABLE DATA public catalog_backup_manifests gildra
203; 0 16430 TABLE DATA other unrelated gildra
300; 2606 16500 CONSTRAINT public users users_pkey gildra
301; 2606 16501 FK CONSTRAINT public game_entities game_entities_user_fkey gildra
302; 0 16502 MATERIALIZED VIEW DATA public snapshot gildra
400; 0 0 SEQUENCE SET public users_id_seq gildra
`

func TestBuildLightRestoreListKeepsSmallDataAndDropsForeignKeys(t *testing.T) {
	counts := map[string]int64{"users": 12, "game_entities": 5_000_000}
	list, report, err := BuildLightRestoreList(sampleTOC, counts, nil, 20000, 0)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(report.RestoredTables, ",") != "users" || strings.Join(report.SkippedDataTables, ",") != "game_entities" {
		t.Fatalf("report = %#v", report)
	}
	lines := strings.Split(list, "\n")
	enabled := func(fragment string) bool {
		for _, line := range lines {
			if strings.Contains(line, fragment) {
				return !strings.HasPrefix(line, ";")
			}
		}
		t.Fatalf("list has no line containing %q", fragment)
		return false
	}
	for fragment, want := range map[string]bool{
		"TABLE DATA public users":                    true,
		"TABLE DATA public game_entities":            false,
		"TABLE DATA public catalog_backup_manifests": false,
		"FK CONSTRAINT":                              false,
		"MATERIALIZED VIEW DATA":                     false,
		"CONSTRAINT public users users_pkey":         true,
		"SEQUENCE SET":                               true,
		"TABLE public users":                         true,
	} {
		if got := enabled(fragment); got != want {
			t.Errorf("%q enabled = %v, want %v", fragment, got, want)
		}
	}
}

func TestBuildLightRestoreListRejectsArchiveWithoutCountedData(t *testing.T) {
	if _, _, err := BuildLightRestoreList("; empty\n", map[string]int64{"users": 1}, nil, 10, 0); err == nil {
		t.Fatal("empty table of contents was accepted")
	}
}

func TestEqualExceptRequiresSkippedTablesToBeEmpty(t *testing.T) {
	source := completeState(MinimumSchemaVersion, 7)
	restore := completeState(MinimumSchemaVersion, 7)
	restore.Counts["game_entities"] = 0
	if err := source.EqualExcept(restore, []string{"game_entities"}); err != nil {
		t.Fatalf("EqualExcept() = %v", err)
	}
	restore.Counts["game_entities"] = 3
	if err := source.EqualExcept(restore, []string{"game_entities"}); err == nil || !strings.Contains(err.Error(), "must be empty") {
		t.Fatalf("EqualExcept() = %v, want empty-table rejection", err)
	}
	restore.Counts["game_entities"] = 0
	restore.Counts["users"] = 6
	if err := source.EqualExcept(restore, []string{"game_entities"}); err == nil || !strings.Contains(err.Error(), "users") {
		t.Fatalf("EqualExcept() = %v, want users mismatch", err)
	}
}

type lightDatabase struct {
	fakeDatabase
	skipped []string
	opened  int
}

func (l *lightDatabase) RestoreLightAndInspect(_ context.Context, _ string, open func() (io.ReadCloser, error), _ State, maxRows, _ int64) (State, LightRestoreReport, error) {
	for range 3 {
		stream, err := open()
		if err != nil {
			return State{}, LightRestoreReport{}, err
		}
		data, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			return State{}, LightRestoreReport{}, err
		}
		if !bytes.Equal(data, l.archive) {
			return State{}, LightRestoreReport{}, io.ErrUnexpectedEOF
		}
		l.opened++
	}
	if maxRows != 77 {
		return State{}, LightRestoreReport{}, io.ErrShortWrite
	}
	return l.restore, LightRestoreReport{SkippedDataTables: l.skipped}, nil
}

func TestRunnerLightProofVerifiesObjectAndRecordsMode(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	source := completeState(MinimumSchemaVersion, 9)
	restore := completeState(MinimumSchemaVersion, 9)
	restore.Counts["game_entities"] = 0
	database := &lightDatabase{
		fakeDatabase: fakeDatabase{source: source, restore: restore, archive: []byte("custom archive")},
		skipped:      []string{"game_entities"},
	}
	store := newMemoryStore("file:///backups/")
	manifests := &memoryManifests{}
	seed := bytes.Repeat([]byte{9}, ed25519.SeedSize)
	result, err := (Runner{Database: database, Store: store, Manifests: manifests}).Run(context.Background(), Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db",
		Product: "wow", TempDirectory: t.TempDir(), Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(seed), RestoreProof: RestoreProofLight, LightMaxTableRows: 77,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.RestoreMode != RestoreProofLight || !result.RestoreVerified || database.opened != 3 {
		t.Fatalf("result = %#v, opened = %d", result, database.opened)
	}
	if manifests.status != "verified" || !bytes.Contains(manifests.verification, []byte(`"restore_mode":"light"`)) ||
		!bytes.Contains(manifests.verification, []byte(`"skipped_data_tables":["game_entities"]`)) {
		t.Fatalf("manifest = %q, verification = %s", manifests.status, manifests.verification)
	}
	var evidence SignedEvidence
	if err := json.Unmarshal(store.objects[store.keyBySuffix(".manifest.json")], &evidence); err != nil {
		t.Fatal(err)
	}
	if err := VerifyEvidence(evidence, ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)); err != nil {
		t.Fatal(err)
	}
	if evidence.Evidence.RestoreMode != RestoreProofLight || len(evidence.Evidence.SkippedDataTables) != 1 {
		t.Fatalf("evidence = %#v", evidence.Evidence)
	}
}

func TestRunnerLightProofRejectsTamperedObject(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	state := completeState(MinimumSchemaVersion, 2)
	store := newMemoryStore("file:///backups/")
	store.tamperDownload = true
	manifests := &memoryManifests{}
	_, err = (Runner{Database: &lightDatabase{fakeDatabase: fakeDatabase{source: state, restore: state, archive: []byte("custom archive")}}, Store: store, Manifests: manifests}).Run(context.Background(), Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db",
		Product: "wow", TempDirectory: t.TempDir(), Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{4}, ed25519.SeedSize)), RestoreProof: RestoreProofLight,
	})
	if err == nil || !strings.Contains(err.Error(), "SHA-256") {
		t.Fatalf("error = %v, want SHA-256 rejection", err)
	}
	if manifests.status != "failed" {
		t.Fatalf("manifest status = %q, want failed", manifests.status)
	}
}

func TestOptionsRejectUnknownRestoreProof(t *testing.T) {
	identity, _ := age.GenerateX25519Identity()
	options := Options{
		SourceDatabaseURL: "postgres://a/db", RestoreDatabaseURL: "postgres://b/db", Product: "wow",
		Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{1}, ed25519.SeedSize)), RestoreProof: "none",
	}
	if err := options.Validate(); err == nil || !strings.Contains(err.Error(), "restore proof") {
		t.Fatalf("Validate() = %v", err)
	}
}

func TestLocalStoreAdoptLinksWithoutCopyAndRefusesOverwrite(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "gildra-postgres-1.dump.age")
	if err := os.WriteFile(source, []byte("archive"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Adopt(context.Background(), "catalog/wow/2026/10/23/postgres-1.dump.age", source, 7); err != nil {
		t.Fatal(err)
	}
	sourceInfo, _ := os.Stat(source)
	targetInfo, err := os.Stat(filepath.Join(root, "catalog/wow/2026/10/23/postgres-1.dump.age"))
	if err != nil || !os.SameFile(sourceInfo, targetInfo) {
		t.Fatalf("adopted object is not a hard link of the source: %v", err)
	}
	if err := store.Adopt(context.Background(), "catalog/wow/2026/10/23/postgres-1.dump.age", source, 7); err == nil {
		t.Fatal("adopt overwrote an existing object")
	}
	if err := store.Adopt(context.Background(), "catalog/wow/2026/10/23/other.dump.age", source, 8); err == nil {
		t.Fatal("adopt accepted a size mismatch")
	}
}

func TestRunnerPublishesLocalArchiveWithoutSecondCopy(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root)
	if err != nil {
		t.Fatal(err)
	}
	state := completeState(MinimumSchemaVersion, 3)
	manifests := &memoryManifests{}
	result, err := (Runner{Database: &fakeDatabase{source: state, restore: state, archive: []byte("custom archive")}, Store: store, Manifests: manifests}).Run(context.Background(), Options{
		SourceDatabaseURL: "postgres://source/db", RestoreDatabaseURL: "postgres://restore/db",
		Product: "wow", ObjectPrefix: "catalog", TempDirectory: root, Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{6}, ed25519.SeedSize)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.RestoreVerified {
		t.Fatalf("result = %#v", result)
	}
	var archives []os.DirEntry
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "gildra-postgres-") {
			archives = append(archives, entry)
		}
	}
	if len(archives) != 0 {
		t.Fatalf("temporary archive was not removed from the volume root: %v", archives)
	}
}

func TestBuildLightRestoreListKeepsWideTablesOutByBytes(t *testing.T) {
	counts := map[string]int64{"users": 12, "game_entities": 5}
	sizes := map[string]int64{"users": 1 << 20, "game_entities": 3 << 30}
	_, report, err := BuildLightRestoreList(sampleTOC, counts, sizes, 20000, 64<<20)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(report.RestoredTables, ",") != "users" || strings.Join(report.SkippedDataTables, ",") != "game_entities" {
		t.Fatalf("report = %#v", report)
	}
	// A table with no recorded size is treated as large.
	_, report, err = BuildLightRestoreList(sampleTOC, counts, map[string]int64{"users": 1}, 20000, 64<<20)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(report.SkippedDataTables, ",") != "game_entities" {
		t.Fatalf("report = %#v", report)
	}
}
