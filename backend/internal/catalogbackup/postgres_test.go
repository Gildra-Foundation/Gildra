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
	contents := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$ARGUMENT_FILE\"\nprintf '%s\\n' \"$PGHOST\" \"$PGPORT\" \"$PGDATABASE\" \"$PGUSER\" \"$PGPASSWORD\" \"$PGSSLMODE\" > \"$ENVIRONMENT_FILE\"\ncat >/dev/null\nprintf 'archive'\n"
	if err := os.WriteFile(script, []byte(contents), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ARGUMENT_FILE", argumentFile)
	t.Setenv("ENVIRONMENT_FILE", environmentFile)
	databaseURL := "postgres://backup:very-secret@postgres.internal:5432/gildra?sslmode=disable"
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
	if string(environment) != "postgres.internal\n5432\ngildra\nbackup\nvery-secret\ndisable\n" {
		t.Fatalf("libpq environment = %q", environment)
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
	if !strings.Contains(string(arguments), "--exit-on-error") || !strings.Contains(string(arguments), "--dbname=gildra") ||
		bytes.Contains(arguments, []byte(databaseURL)) || bytes.Contains(arguments, []byte("very-secret")) {
		t.Fatalf("restore arguments = %s", arguments)
	}
}

func TestProcessArchiveToolRedactsCredentialsFromErrors(t *testing.T) {
	script := filepath.Join(t.TempDir(), "failing-tool")
	databaseURL := "postgres://backup:very-secret@postgres.internal:5432/gildra"
	contents := "#!/bin/sh\nprintf '%s %s' \"$PGDATABASE\" \"$PGPASSWORD\" >&2\nexit 1\n"
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
	t.Setenv("PGSSLNEGOTIATION", "wrong-negotiation")
	t.Setenv("PGREQUIREAUTH", "wrong-auth")
	t.Setenv("PGGSSENCMODE", "wrong-gss-mode")
	t.Setenv("PGKRBSRVNAME", "wrong-kerberos-service")
	t.Setenv("UNRELATED_BACKUP_TEST", "kept")
	environmentValues, err := databaseEnvironment("postgres://right-user:right-password@right-host:5544/right-database?sslmode=require&connect_timeout=9")
	if err != nil {
		t.Fatal(err)
	}
	environment := strings.Join(environmentValues, "\n")
	for _, expected := range []string{
		"PGHOST=right-host", "PGPORT=5544", "PGDATABASE=right-database", "PGUSER=right-user",
		"PGPASSWORD=right-password", "PGSSLMODE=require", "PGCONNECT_TIMEOUT=9", "UNRELATED_BACKUP_TEST=kept",
	} {
		if !strings.Contains(environment, expected) {
			t.Fatalf("database environment is missing %q: %s", expected, environment)
		}
	}
	for _, forbidden := range []string{
		"PGHOST=wrong-host", "PGPASSWORD=wrong-password", "PGDATABASE=postgres://",
		"PGSSLNEGOTIATION=wrong-negotiation", "PGREQUIREAUTH=wrong-auth",
		"PGGSSENCMODE=wrong-gss-mode", "PGKRBSRVNAME=wrong-kerberos-service",
	} {
		if strings.Contains(environment, forbidden) {
			t.Fatalf("conflicting or unsafe value %q was retained: %s", forbidden, environment)
		}
	}
	if strings.Count(environment, "PGCONNECT_TIMEOUT=") != 1 {
		t.Fatalf("database environment = %s", environment)
	}
}

func TestDatabaseEnvironmentRejectsNonURLConnectionStrings(t *testing.T) {
	_, err := databaseEnvironment("host=postgres.internal dbname=gildra user=backup")
	if err == nil || !strings.Contains(err.Error(), "postgres URL") {
		t.Fatalf("non-URL connection error = %v", err)
	}
}
