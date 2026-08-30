//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"filippo.io/age"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogbackup"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestCatalogBackupRestoresRealPostgresArchive(t *testing.T) {
	ctx := context.Background()
	source := runBackupPostgres(t, ctx, "gildra")
	restore := runBackupPostgres(t, ctx, "gildra_restore")
	sourceURL, err := source.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	restoreURL, err := restore.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", sourceURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatalf("migrate source database: %v", err)
	}
	const proofEmail = "backup-restore-proof@example.invalid"
	if _, err := database.ExecContext(ctx, `INSERT INTO users(email,display_name) VALUES($1,'Backup proof')`, proofEmail); err != nil {
		t.Fatal(err)
	}
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	store := &integrationObjectStore{objects: make(map[string][]byte)}
	pool, err := pgxpool.New(ctx, sourceURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	result, err := (catalogbackup.Runner{
		Database: catalogbackup.PostgresOperator{Archive: dockerPostgresArchive{
			SourceContainer: source, RestoreContainer: restore,
		}},
		Store: store, Manifests: catalogbackup.PostgresManifestRepository{DB: pool},
	}).Run(ctx, catalogbackup.Options{
		SourceDatabaseURL: sourceURL, RestoreDatabaseURL: restoreURL,
		Product: "wow", ObjectPrefix: "integration", TempDirectory: t.TempDir(),
		Recipient: identity.Recipient(), Identity: identity,
		SigningKey: ed25519.NewKeyFromSeed(bytes.Repeat([]byte{8}, ed25519.SeedSize)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.RestoreVerified || !result.SourceRestoreMatch || result.DatabaseVersion != latestCatalogSchemaVersion {
		t.Fatalf("unexpected backup result: %#v", result)
	}
	restoredDatabase, err := sql.Open("pgx", restoreURL)
	if err != nil {
		t.Fatal(err)
	}
	defer restoredDatabase.Close()
	var restoredDisplayName string
	if err := restoredDatabase.QueryRowContext(ctx, `SELECT display_name FROM users WHERE email=$1`, proofEmail).Scan(&restoredDisplayName); err != nil {
		t.Fatalf("read restored proof row: %v", err)
	}
	if restoredDisplayName != "Backup proof" {
		t.Fatalf("restored display name = %q", restoredDisplayName)
	}
	var status, artifactURI, evidenceURI string
	var restoreVerified, sourceRestoreMatch bool
	if err := database.QueryRowContext(ctx, `
		SELECT status,storage_uri,verification->>'evidence_uri',
			(verification->>'restore_verified')::boolean,
			(verification->>'source_restore_match')::boolean
		FROM catalog_backup_manifests WHERE id=$1`, result.ManifestID).Scan(
		&status, &artifactURI, &evidenceURI, &restoreVerified, &sourceRestoreMatch,
	); err != nil {
		t.Fatal(err)
	}
	if status != "verified" || !restoreVerified || !sourceRestoreMatch ||
		!strings.HasPrefix(artifactURI, "r2://integration/") || !strings.HasPrefix(evidenceURI, "r2://integration/") {
		t.Fatalf("manifest evidence = (%s,%s,%s,%t,%t)", status, artifactURI, evidenceURI, restoreVerified, sourceRestoreMatch)
	}
}

func runBackupPostgres(t *testing.T, ctx context.Context, database string) *pgcontainer.PostgresContainer {
	t.Helper()
	container, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase(database),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	return container
}

type dockerPostgresArchive struct {
	SourceContainer  testcontainers.Container
	RestoreContainer testcontainers.Container
}

func (d dockerPostgresArchive) Dump(ctx context.Context, _ string, snapshotID string, destination io.Writer) error {
	const archivePath = "/tmp/gildra-backup.dump"
	exitCode, output, err := d.SourceContainer.Exec(ctx, []string{
		"pg_dump", "--username=gildra", "--dbname=gildra", "--format=custom", "--compress=6",
		"--no-owner", "--no-privileges", "--snapshot=" + snapshotID, "--file=" + archivePath,
	})
	if err != nil {
		return fmt.Errorf("container pg_dump: %w", err)
	}
	if exitCode != 0 {
		message, _ := io.ReadAll(output)
		return fmt.Errorf("container pg_dump exit code %d: %s", exitCode, strings.TrimSpace(string(message)))
	}
	archive, err := d.SourceContainer.CopyFileFromContainer(ctx, archivePath)
	if err != nil {
		return fmt.Errorf("read container pg_dump archive: %w", err)
	}
	defer archive.Close()
	if _, err := io.Copy(destination, archive); err != nil {
		return fmt.Errorf("copy container pg_dump archive: %w", err)
	}
	_, _, _ = d.SourceContainer.Exec(ctx, []string{"rm", "-f", archivePath})
	return nil
}

func (d dockerPostgresArchive) Restore(ctx context.Context, _ string, source io.Reader) error {
	temporaryArchive, err := os.CreateTemp("", "gildra-backup-*.dump")
	if err != nil {
		return fmt.Errorf("create pg_restore staging file: %w", err)
	}
	temporaryPath := temporaryArchive.Name()
	defer os.Remove(temporaryPath)
	if _, err := io.Copy(temporaryArchive, source); err != nil {
		temporaryArchive.Close()
		return fmt.Errorf("stage pg_restore archive: %w", err)
	}
	if err := temporaryArchive.Close(); err != nil {
		return fmt.Errorf("close pg_restore staging file: %w", err)
	}
	const archivePath = "/tmp/gildra-restore.dump"
	if err := d.RestoreContainer.CopyFileToContainer(ctx, temporaryPath, archivePath, 0o600); err != nil {
		return fmt.Errorf("copy pg_restore archive: %w", err)
	}
	exitCode, output, err := d.RestoreContainer.Exec(ctx, []string{
		"pg_restore", "--username=gildra", "--dbname=gildra_restore", "--exit-on-error", "--no-owner", "--no-privileges", archivePath,
	})
	if err != nil {
		return fmt.Errorf("container pg_restore: %w", err)
	}
	if exitCode != 0 {
		message, _ := io.ReadAll(output)
		return fmt.Errorf("container pg_restore exit code %d: %s", exitCode, strings.TrimSpace(string(message)))
	}
	_, _, _ = d.RestoreContainer.Exec(ctx, []string{"rm", "-f", archivePath})
	return nil
}

type integrationObjectStore struct {
	objects map[string][]byte
}

func (s *integrationObjectStore) URI(key string) string { return "r2://integration/" + key }

func (s *integrationObjectStore) Put(_ context.Context, key string, source io.Reader, size int64, _ string, _ map[string]string) error {
	data, err := io.ReadAll(source)
	if err != nil {
		return err
	}
	if int64(len(data)) != size {
		return fmt.Errorf("object size = %d, want %d", len(data), size)
	}
	s.objects[key] = data
	return nil
}

func (s *integrationObjectStore) Get(_ context.Context, key string) (catalogbackup.StoredObject, error) {
	data, ok := s.objects[key]
	if !ok {
		return catalogbackup.StoredObject{}, fmt.Errorf("object %s not found", key)
	}
	return catalogbackup.StoredObject{Body: io.NopCloser(bytes.NewReader(data)), Size: int64(len(data))}, nil
}
