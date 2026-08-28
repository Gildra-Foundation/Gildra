package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"filippo.io/age"
)

func TestParseAgeIdentityAcceptsAgeKeygenFile(t *testing.T) {
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	value := "# created: 2026-08-28T00:00:00Z\n# public key: " + identity.Recipient().String() + "\n" + identity.String() + "\n"

	parsed, err := parseAgeIdentity(value)
	if err != nil {
		t.Fatal(err)
	}
	parsedX25519, ok := parsed.(*age.X25519Identity)
	if !ok {
		t.Fatalf("parsed identity type = %T, want *age.X25519Identity", parsed)
	}
	if parsedX25519.String() != identity.String() {
		t.Fatalf("parsed identity = %q, want %q", parsedX25519.String(), identity.String())
	}
}

func TestParseAgeIdentityRejectsMultipleKeys(t *testing.T) {
	first, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	second, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}

	_, err = parseAgeIdentity(first.String() + "\n" + second.String() + "\n")
	if err == nil || !strings.Contains(err.Error(), "exactly one") {
		t.Fatalf("multiple identity error = %v", err)
	}
}

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
