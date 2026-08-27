package catalogbackup

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func TestMinimumSchemaVersionTracksLatestProductionMigration(t *testing.T) {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve backup package source path")
	}
	migrationDirectory := filepath.Join(filepath.Dir(sourceFile), "..", "..", "migrations", "postgres")
	entries, err := os.ReadDir(migrationDirectory)
	if err != nil {
		t.Fatalf("read PostgreSQL migrations: %v", err)
	}

	var latest int64
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || len(name) < 6 || name[5] != '_' || !strings.HasSuffix(name, ".sql") {
			continue
		}
		version, err := strconv.ParseInt(name[:5], 10, 64)
		if err != nil {
			continue
		}
		if version > latest {
			latest = version
		}
	}
	if latest == 0 {
		t.Fatal("no numbered PostgreSQL migrations found")
	}
	if MinimumSchemaVersion != latest {
		t.Fatalf("backup minimum schema version = %d, latest production migration = %d", MinimumSchemaVersion, latest)
	}
}
