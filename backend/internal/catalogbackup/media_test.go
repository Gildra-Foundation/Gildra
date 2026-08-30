package catalogbackup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
)

func TestMediaSnapshotIsDeterministicAndChecksReferences(t *testing.T) {
	ctx := context.Background()
	first := t.TempDir()
	second := t.TempDir()
	files := map[string]string{
		"ab/first.jpg":  "first-media",
		"00/second.png": "second-media",
	}
	for name, value := range files {
		writeMediaTestFile(t, first, name, value)
	}
	// Create the second tree in reverse lexical order to prove traversal order
	// does not affect the canonical manifest hash.
	writeMediaTestFile(t, second, "00/second.png", files["00/second.png"])
	writeMediaTestFile(t, second, "ab/first.jpg", files["ab/first.jpg"])

	options := MediaSnapshotOptions{
		MaxFiles:       10,
		MaxBytes:       1024,
		ReferencedKeys: []string{"ab/first.jpg", "ab/first.jpg", "00/second.png"},
	}
	leftSnapshot, leftManifest, err := (MediaSnapshotter{}).Snapshot(ctx, first, options)
	if err != nil {
		t.Fatal(err)
	}
	rightSnapshot, rightManifest, err := (MediaSnapshotter{}).Snapshot(ctx, second, options)
	if err != nil {
		t.Fatal(err)
	}
	if leftSnapshot != rightSnapshot || !equalMediaManifests(leftManifest, rightManifest) {
		t.Fatalf("snapshots differ: left=%#v right=%#v", leftSnapshot, rightSnapshot)
	}
	if leftSnapshot.FileCount != 2 || leftSnapshot.ByteSize != int64(len("first-mediasecond-media")) ||
		leftSnapshot.ReferencedFileCount != 2 || leftSnapshot.MissingReferenceCount != 0 {
		t.Fatalf("unexpected snapshot: %#v", leftSnapshot)
	}

	_, _, err = (MediaSnapshotter{}).Snapshot(ctx, first, MediaSnapshotOptions{
		MaxFiles: 10, MaxBytes: 1024, ReferencedKeys: []string{"missing.png"},
	})
	if err == nil || !strings.Contains(err.Error(), "missing referenced files") {
		t.Fatalf("missing reference error = %v", err)
	}
}

func TestMediaSnapshotRejectsSymlinksAndLimits(t *testing.T) {
	root := t.TempDir()
	writeMediaTestFile(t, root, "aa/file.jpg", "payload")
	if err := os.Symlink(filepath.Join(t.TempDir(), "outside"), filepath.Join(root, "aa", "escape")); err != nil {
		t.Fatal(err)
	}
	_, _, err := (MediaSnapshotter{}).Snapshot(context.Background(), root, MediaSnapshotOptions{MaxFiles: 10, MaxBytes: 1024})
	if err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("symlink error = %v", err)
	}

	limitedRoot := t.TempDir()
	writeMediaTestFile(t, limitedRoot, "aa/file.jpg", "payload")
	_, _, err = (MediaSnapshotter{}).Snapshot(context.Background(), limitedRoot, MediaSnapshotOptions{MaxFiles: 1, MaxBytes: 3})
	if err == nil || !strings.Contains(err.Error(), "max bytes") {
		t.Fatalf("byte limit error = %v", err)
	}
	_, _, err = (MediaSnapshotter{}).Snapshot(context.Background(), limitedRoot, MediaSnapshotOptions{MaxFiles: 0, MaxBytes: 1024})
	if err == nil || !strings.Contains(err.Error(), "max files") {
		t.Fatalf("file limit error = %v", err)
	}
}

func TestMediaArchiveRoundTripAndManifestRecord(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeMediaTestFile(t, root, "00/icon.jpg", "icon-payload")
	writeMediaTestFile(t, root, "ff/tile.png", "tile-payload")
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	result, err := (MediaSnapshotter{}).CreateArchive(ctx, root, MediaSnapshotOptions{
		MaxFiles: 10, MaxBytes: 1024, ReferencedKeys: []string{"00/icon.jpg", "ff/tile.png"},
	}, identity.Recipient(), &archive)
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.Bytes()) == 0 || len(result.Manifest) == 0 || result.Snapshot.ArchiveByteSize != int64(archive.Len()) ||
		!isSHA256Hex(result.Snapshot.ArchiveSHA256) || !isSHA256Hex(result.Snapshot.ManifestSHA256) {
		t.Fatalf("invalid archive result: %#v archive=%d manifest=%d", result.Snapshot, archive.Len(), len(result.Manifest))
	}
	var sidecar MediaManifest
	if err := json.Unmarshal(result.Manifest, &sidecar); err != nil {
		t.Fatal(err)
	}
	if err := validateMediaManifest(sidecar); err != nil {
		t.Fatal(err)
	}
	backupRoot := t.TempDir()
	if err := os.Chmod(backupRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	backupStore, err := NewLocalStore(backupRoot)
	if err != nil {
		t.Fatal(err)
	}
	const archiveKey = "catalog/wow/2026/08/30/media.tar.gz.age"
	const sidecarKey = "catalog/wow/2026/08/30/media.manifest.json"
	if err := backupStore.Put(ctx, archiveKey, bytes.NewReader(archive.Bytes()), int64(archive.Len()), "application/octet-stream", nil); err != nil {
		t.Fatal(err)
	}
	if err := backupStore.Put(ctx, sidecarKey, bytes.NewReader(result.Manifest), int64(len(result.Manifest)), "application/json", nil); err != nil {
		t.Fatal(err)
	}
	storedArchive, err := backupStore.Get(ctx, archiveKey)
	if err != nil {
		t.Fatal(err)
	}
	storedBytes, err := io.ReadAll(storedArchive.Body)
	storedArchive.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(storedBytes, archive.Bytes()) {
		t.Fatal("local object store changed the encrypted media archive")
	}

	restored := t.TempDir()
	got, err := (MediaSnapshotter{}).RestoreAndVerify(ctx, restored, bytes.NewReader(storedBytes), identity, result.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if got.FileCount != result.Snapshot.FileCount || got.ByteSize != result.Snapshot.ByteSize ||
		got.ManifestSHA256 != result.Snapshot.ManifestSHA256 || got.ArchiveSHA256 != result.Snapshot.ArchiveSHA256 {
		t.Fatalf("restored snapshot=%#v want=%#v", got, result.Snapshot)
	}
	missing, err := VerifyReferencedMediaKeys(ctx, restored, []string{"00/icon.jpg", "missing.jpg"})
	if err != nil || missing != 1 {
		t.Fatalf("referenced keys missing=%d err=%v, want 1 nil", missing, err)
	}
	missing, err = VerifyReferencedMedia(ctx, restored, []MediaReference{
		{CacheKey: "00/icon.jpg", SHA256: sha256Hex("icon-payload"), Bytes: int64(len("icon-payload"))},
		{CacheKey: "missing.jpg", SHA256: sha256Hex("missing"), Bytes: int64(len("missing"))},
	})
	if err != nil || missing != 1 {
		t.Fatalf("referenced media missing=%d err=%v, want 1 nil", missing, err)
	}
	_, err = VerifyReferencedMedia(ctx, restored, []MediaReference{{
		CacheKey: "00/icon.jpg", SHA256: sha256Hex("tampered"), Bytes: int64(len("icon-payload")),
	}})
	if err == nil || !strings.Contains(err.Error(), "hash mismatch") {
		t.Fatalf("referenced media hash error=%v", err)
	}

	record := MediaManifestRecord{
		ManifestID: uuid.New(), Product: "wow", Component: "media", BackupKind: "full",
		ArtifactURI: "file:///var/lib/gildra/catalog-backups/media.tar.gz.age",
		SidecarURI:  "file:///var/lib/gildra/catalog-backups/media.manifest.json",
		Snapshot:    result.Snapshot, RestoreVerified: true,
	}
	if err := record.Validate(); err != nil {
		t.Fatal(err)
	}
	start, err := record.ManifestStart()
	if err != nil || start.ID != record.ManifestID || start.Product != record.Product || start.StorageURI != record.ArtifactURI {
		t.Fatalf("media manifest start=%#v err=%v", start, err)
	}
	record.Component = "postgres"
	if err := record.Validate(); err == nil || !strings.Contains(err.Error(), "component") {
		t.Fatalf("invalid component error=%v", err)
	}
}

func TestMediaArchiveRejectsTamperingTraversalAndMissingEntries(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeMediaTestFile(t, root, "aa/file.jpg", "payload")
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	created, err := (MediaSnapshotter{}).CreateArchive(ctx, root, MediaSnapshotOptions{MaxFiles: 10, MaxBytes: 1024}, identity.Recipient(), &archive)
	if err != nil {
		t.Fatal(err)
	}
	tampered := append([]byte(nil), archive.Bytes()...)
	tampered[len(tampered)/2] ^= 0xff
	if _, err := (MediaSnapshotter{}).RestoreAndVerify(ctx, t.TempDir(), bytes.NewReader(tampered), identity, created.Snapshot); err == nil {
		t.Fatal("tampered archive was accepted")
	}

	maliciousManifest := MediaManifest{Format: mediaArchiveFormat, Version: mediaArchiveVersion, Files: []MediaFile{{Path: "../escape", Bytes: 1, SHA256: sha256Hex("x")}}}
	maliciousArchive := encryptedTestArchive(t, identity.Recipient(), maliciousManifest, []testTarEntry{{name: "../escape", content: []byte("x"), typeflag: tar.TypeReg}})
	maliciousExpected := MediaSnapshot{
		ManifestSHA256: sha256Hex(rawJSONManifest(t, maliciousManifest)),
		ArchiveSHA256:  sha256Hex(maliciousArchive),
	}
	if _, err := (MediaSnapshotter{}).RestoreAndVerify(ctx, t.TempDir(), bytes.NewReader(maliciousArchive), identity, maliciousExpected); err == nil {
		t.Fatal("path traversal archive was accepted")
	}

	validManifest := MediaManifest{Format: mediaArchiveFormat, Version: mediaArchiveVersion, Files: []MediaFile{{Path: "aa/file.jpg", Bytes: int64(len("payload")), SHA256: sha256Hex("payload")}, {Path: "bb/missing.png", Bytes: 1, SHA256: sha256Hex("x")}}}
	missingArchive := encryptedTestArchive(t, identity.Recipient(), validManifest, []testTarEntry{{name: "aa/file.jpg", content: []byte("payload"), typeflag: tar.TypeReg}})
	missingExpected := MediaSnapshot{ManifestSHA256: sha256Hex(rawJSONManifest(t, validManifest)), ArchiveSHA256: sha256Hex(missingArchive)}
	if _, err := (MediaSnapshotter{}).RestoreAndVerify(ctx, t.TempDir(), bytes.NewReader(missingArchive), identity, missingExpected); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("missing entry error=%v", err)
	}
}

func TestMediaArchiveRejectsNonEmptyRestoreRoot(t *testing.T) {
	root := t.TempDir()
	writeMediaTestFile(t, root, "aa/file.jpg", "payload")
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	created, err := (MediaSnapshotter{}).CreateArchive(context.Background(), root, MediaSnapshotOptions{MaxFiles: 10, MaxBytes: 1024}, identity.Recipient(), &archive)
	if err != nil {
		t.Fatal(err)
	}
	restore := t.TempDir()
	writeMediaTestFile(t, restore, "existing", "do not overwrite")
	if _, err := (MediaSnapshotter{}).RestoreAndVerify(context.Background(), restore, bytes.NewReader(archive.Bytes()), identity, created.Snapshot); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("non-empty restore root error=%v", err)
	}
}

type testTarEntry struct {
	name     string
	content  []byte
	link     string
	typeflag byte
}

func encryptedTestArchive(t *testing.T, recipient age.Recipient, manifest MediaManifest, entries []testTarEntry) []byte {
	t.Helper()
	manifestBytes := rawJSONManifest(t, manifest)
	var archive bytes.Buffer
	encrypted, err := age.Encrypt(&archive, recipient)
	if err != nil {
		t.Fatal(err)
	}
	compressed := gzip.NewWriter(encrypted)
	compressed.Header.ModTime = unixEpoch()
	tarWriter := tar.NewWriter(compressed)
	if err := writeTarEntry(context.Background(), tarWriter, mediaManifestName, manifestBytes, 0o640); err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		header := &tar.Header{Name: entry.name, Mode: 0o640, Size: int64(len(entry.content)), Typeflag: entry.typeflag, Linkname: entry.link}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if entry.typeflag == tar.TypeReg {
			if _, err := tarWriter.Write(entry.content); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	if err := encrypted.Close(); err != nil {
		t.Fatal(err)
	}
	return archive.Bytes()
}

func rawJSONManifest(t *testing.T, manifest MediaManifest) []byte {
	t.Helper()
	value, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return append(value, '\n')
}

func writeMediaTestFile(t *testing.T, root, relative, content string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatal(err)
	}
}

func sha256Hex(value any) string {
	var payload []byte
	switch current := value.(type) {
	case string:
		payload = []byte(current)
	case []byte:
		payload = current
	default:
		payload, _ = json.Marshal(value)
	}
	hash := sha256.Sum256(payload)
	return hex.EncodeToString(hash[:])
}

func equalMediaManifests(left, right MediaManifest) bool {
	leftBytes, leftErr := marshalMediaManifest(left)
	rightBytes, rightErr := marshalMediaManifest(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func unixEpoch() (result time.Time) {
	return time.Unix(0, 0).UTC()
}
