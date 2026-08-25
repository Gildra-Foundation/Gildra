package catalogbackup

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProcessArchiveToolKeepsDatabaseURLOutOfArguments(t *testing.T) {
	argumentFile := filepath.Join(t.TempDir(), "arguments")
	environmentFile := filepath.Join(t.TempDir(), "environment")
	script := filepath.Join(t.TempDir(), "archive-tool")
	contents := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$ARGUMENT_FILE\"\nprintf '%s' \"$PGDATABASE\" > \"$ENVIRONMENT_FILE\"\ncat >/dev/null\nprintf 'archive'\n"
	if err := os.WriteFile(script, []byte(contents), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ARGUMENT_FILE", argumentFile)
	t.Setenv("ENVIRONMENT_FILE", environmentFile)
	databaseURL := "postgres://backup:very-secret@postgres.internal:5432/gildra"
	tool := ProcessArchiveTool{DumpBinary: script, RestoreBinary: script}
	var archive bytes.Buffer
	if err := tool.Dump(context.Background(), databaseURL, "snapshot-id", &archive); err != nil {
		t.Fatal(err)
	}
	arguments, err := os.ReadFile(argumentFile)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(arguments, []byte(databaseURL)) || bytes.Contains(arguments, []byte("very-secret")) {
		t.Fatalf("database credentials leaked into process arguments: %s", arguments)
	}
	environment, err := os.ReadFile(environmentFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(environment) != databaseURL {
		t.Fatalf("PGDATABASE = %q, want connection URL", environment)
	}
	if !strings.Contains(string(arguments), "--format=custom") || !strings.Contains(string(arguments), "--snapshot=snapshot-id") {
		t.Fatalf("dump safety arguments = %s", arguments)
	}
	if err := tool.Restore(context.Background(), databaseURL, strings.NewReader("archive")); err != nil {
		t.Fatal(err)
	}
	arguments, err = os.ReadFile(argumentFile)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(arguments), "--exit-on-error") || bytes.Contains(arguments, []byte(databaseURL)) {
		t.Fatalf("restore arguments = %s", arguments)
	}
}

func TestProcessArchiveToolRedactsCredentialsFromErrors(t *testing.T) {
	script := filepath.Join(t.TempDir(), "failing-tool")
	databaseURL := "postgres://backup:very-secret@postgres.internal:5432/gildra"
	contents := "#!/bin/sh\nprintf '%s' \"$PGDATABASE\" >&2\nexit 1\n"
	if err := os.WriteFile(script, []byte(contents), 0o700); err != nil {
		t.Fatal(err)
	}
	err := (ProcessArchiveTool{DumpBinary: script}).Dump(context.Background(), databaseURL, "snapshot", &bytes.Buffer{})
	if err == nil {
		t.Fatal("expected dump failure")
	}
	if strings.Contains(err.Error(), databaseURL) || strings.Contains(err.Error(), "very-secret") {
		t.Fatalf("credentials leaked in error: %v", err)
	}
}

func TestDatabaseEnvironmentRemovesConflictingLibPQSettings(t *testing.T) {
	t.Setenv("PGHOST", "wrong-host")
	t.Setenv("PGPASSWORD", "wrong-password")
	t.Setenv("PGSSLMODE", "disable")
	t.Setenv("UNRELATED_BACKUP_TEST", "kept")
	environment := strings.Join(databaseEnvironment("postgres://right/database"), "\n")
	for _, forbidden := range []string{"PGHOST=", "PGPASSWORD=", "PGSSLMODE="} {
		if strings.Contains(environment, forbidden) {
			t.Fatalf("conflicting variable %q was retained: %s", forbidden, environment)
		}
	}
	if !strings.Contains(environment, "PGDATABASE=postgres://right/database") || !strings.Contains(environment, "UNRELATED_BACKUP_TEST=kept") {
		t.Fatalf("database environment = %s", environment)
	}
}
