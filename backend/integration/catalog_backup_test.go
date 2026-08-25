//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"database/sql"
	"fmt"
	"io"
	"os/exec"
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
	sourceID := source.GetContainerID()
	restoreID := restore.GetContainerID()
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
			SourceContainer: sourceID, RestoreContainer: restoreID,
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
	if !result.RestoreVerified || !result.SourceRestoreMatch || result.DatabaseVersion != 71 {
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
	SourceContainer  string
	RestoreContainer string
}

func (d dockerPostgresArchive) Dump(ctx context.Context, _ string, snapshotID string, destination io.Writer) error {
	command := exec.CommandContext(ctx, "docker", "exec", "-e", "PGPASSWORD=test-password", d.SourceContainer,
		"pg_dump", "--username=gildra", "--dbname=gildra", "--format=custom", "--compress=6",
		"--no-owner", "--no-privileges", "--snapshot="+snapshotID,
	)
	command.Stdout = destination
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("container pg_dump: %w: %s", err, stderr.String())
	}
	return nil
}

func (d dockerPostgresArchive) Restore(ctx context.Context, _ string, source io.Reader) error {
	command := exec.CommandContext(ctx, "docker", "exec", "-i", "-e", "PGPASSWORD=test-password", d.RestoreContainer,
		"pg_restore", "--username=gildra", "--dbname=gildra_restore", "--exit-on-error", "--no-owner", "--no-privileges",
	)
	command.Stdin = source
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("container pg_restore: %w: %s", err, stderr.String())
	}
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
