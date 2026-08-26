package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidRevision(t *testing.T) {
	t.Parallel()
	if !validRevision("77b0b6e5cbc39dab31746c21e7c68964414e76e5") {
		t.Fatal("expected pinned Git revision to be valid")
	}
	for _, invalid := range []string{"", "main", "77B0B6E5CBC39DAB31746C21E7C68964414E76E5", "../../revision"} {
		if validRevision(invalid) {
			t.Fatalf("revision %q should be invalid", invalid)
		}
	}
}

func TestSourceFilesAreSortedAndBounded(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range []string{"Zones.lua", "BlackMarket.lua", "README.md"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("test"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	files, err := sourceFiles(root, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || filepath.Base(files[0]) != "BlackMarket.lua" {
		t.Fatalf("files = %#v", files)
	}
}

func TestImmutableSourceURLPinsRevision(t *testing.T) {
	t.Parallel()
	revision := "77b0b6e5cbc39dab31746c21e7c68964414e76e5"
	got := immutableSourceURL(revision, "Black Market.lua")
	want := "https://raw.githubusercontent.com/ATTWoWAddon/AllTheThings/" + revision + "/db/Standard/Categories/Black%20Market.lua"
	if got != want {
		t.Fatalf("source URL = %q, want %q", got, want)
	}
}
