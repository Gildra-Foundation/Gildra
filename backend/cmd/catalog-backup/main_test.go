package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSecretEnvironmentUsesFileReference(t *testing.T) {
	t.Setenv("TEST_BACKUP_SECRET", "")
	directory := t.TempDir()
	path := filepath.Join(directory, "credential")
	if err := os.WriteFile(path, []byte("referenced-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TEST_BACKUP_SECRET_FILE", path)

	value, err := secretEnvironment("TEST_BACKUP_SECRET")
	if err != nil {
		t.Fatal(err)
	}
	if value != "referenced-value" {
		t.Fatalf("secret value was not trimmed: %q", value)
	}
}

func TestSecretEnvironmentRejectsAmbiguousConfiguration(t *testing.T) {
	t.Setenv("TEST_BACKUP_SECRET", "direct-value")
	path := filepath.Join(t.TempDir(), "credential")
	if err := os.WriteFile(path, []byte("referenced-value"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TEST_BACKUP_SECRET_FILE", path)

	_, err := secretEnvironment("TEST_BACKUP_SECRET")
	if err == nil || !strings.Contains(err.Error(), "configure only one") {
		t.Fatalf("ambiguous secret configuration error = %v", err)
	}
}

func TestSecretEnvironmentRejectsRelativeOrEmptyFile(t *testing.T) {
	t.Setenv("TEST_BACKUP_SECRET", "")
	t.Setenv("TEST_BACKUP_SECRET_FILE", "relative-secret")
	if _, err := secretEnvironment("TEST_BACKUP_SECRET"); err == nil || !strings.Contains(err.Error(), "absolute path") {
		t.Fatalf("relative secret file error = %v", err)
	}

	path := filepath.Join(t.TempDir(), "empty")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TEST_BACKUP_SECRET_FILE", path)
	if _, err := secretEnvironment("TEST_BACKUP_SECRET"); err == nil || !strings.Contains(err.Error(), "is empty") {
		t.Fatalf("empty secret file error = %v", err)
	}
}
