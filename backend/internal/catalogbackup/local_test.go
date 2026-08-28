package catalogbackup

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalStoreRoundTripAndRejectsOverwrite(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root)
	if err != nil {
		t.Fatal(err)
	}
	const key = "catalog/wow/2026/08/28/backup.dump.age"
	const payload = "encrypted-backup"
	if err := store.Put(context.Background(), key, strings.NewReader(payload), int64(len(payload)), "application/octet-stream", nil); err != nil {
		t.Fatal(err)
	}
	if uri := store.URI(key); !strings.HasPrefix(uri, "file://") {
		t.Fatalf("URI = %q, want file URI", uri)
	}
	object, err := store.Get(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	defer object.Body.Close()
	got, err := io.ReadAll(object.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != payload || object.Size != int64(len(payload)) {
		t.Fatalf("object = %q size=%d", got, object.Size)
	}
	if err := store.Put(context.Background(), key, strings.NewReader(payload), int64(len(payload)), "application/octet-stream", nil); err == nil {
		t.Fatal("existing local backup object was overwritten")
	}
}

func TestLocalStoreRejectsUnsafePathsAndSizeMismatch(t *testing.T) {
	if _, err := NewLocalStore("relative/backups"); err == nil {
		t.Fatal("relative backup root was accepted")
	}
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), "../escape", strings.NewReader("x"), 1, "", nil); err == nil {
		t.Fatal("path traversal was accepted")
	}
	if err := store.Put(context.Background(), "catalog/short", strings.NewReader("x"), 2, "", nil); err == nil {
		t.Fatal("size mismatch was accepted")
	}
}

func TestLocalStoreRejectsSharedDirectory(t *testing.T) {
	root := filepath.Join(t.TempDir(), "shared")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := NewLocalStore(root); err == nil {
		t.Fatal("group-readable backup root was accepted")
	}
}

func TestLocalStoreRejectsSymlinkEscape(t *testing.T) {
	root := filepath.Join(t.TempDir(), "private")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), "escape/backup.dump.age", strings.NewReader("x"), 1, "", nil); err == nil {
		t.Fatal("symlink escape was accepted")
	}
}
