package catalogbackup

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresManifestRepository struct {
	DB *pgxpool.Pool
}

var _ MediaManifestRepository = PostgresManifestRepository{}

func (r PostgresManifestRepository) Create(ctx context.Context, start ManifestStart) error {
	if r.DB == nil {
		return fmt.Errorf("manifest database is required")
	}
	tag, err := r.DB.Exec(ctx, `
		INSERT INTO catalog_backup_manifests(
			id,component,backup_kind,status,storage_uri,product_id
		)
		SELECT $1,'postgres','logical','creating',$2,product.id
		FROM game_products product
		WHERE product.slug=$3`, start.ID, start.StorageURI, start.Product)
	if err != nil {
		return fmt.Errorf("create backup manifest: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("create backup manifest: expected one row, got %d", tag.RowsAffected())
	}
	return nil
}

// CreateMedia creates the sidecar manifest row for a full catalog_media
// volume archive. It deliberately does not alter the existing PostgreSQL
// manifest path; callers must mark this row verified only after the media
// archive has been restored and its cache keys have been checked.
func (r PostgresManifestRepository) CreateMedia(ctx context.Context, start ManifestStart) error {
	if r.DB == nil {
		return fmt.Errorf("manifest database is required")
	}
	tag, err := r.DB.Exec(ctx, `
		INSERT INTO catalog_backup_manifests(
			id,component,backup_kind,status,storage_uri,product_id
		)
		SELECT $1,'media','full','creating',$2,product.id
		FROM game_products product
		WHERE product.slug=$3`, start.ID, start.StorageURI, start.Product)
	if err != nil {
		return fmt.Errorf("create media backup manifest: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("create media backup manifest: expected one row, got %d", tag.RowsAffected())
	}
	return nil
}

func (r PostgresManifestRepository) MarkCreated(ctx context.Context, id uuid.UUID, created ManifestCreated) error {
	tag, err := r.DB.Exec(ctx, `
		UPDATE catalog_backup_manifests
		SET status='created',content_hash=$2,byte_size=$3,database_version=$4,
			completed_at=now(),updated_at=now(),error_summary=''
		WHERE id=$1`, id, created.Hash[:], created.ByteSize, created.DatabaseVersion)
	if err != nil {
		return fmt.Errorf("mark backup created: %w", err)
	}
	return expectManifestRow("mark backup created", tag.RowsAffected())
}

func (r PostgresManifestRepository) MarkVerifying(ctx context.Context, id uuid.UUID, startedAt time.Time) error {
	tag, err := r.DB.Exec(ctx, `
		UPDATE catalog_backup_manifests
		SET status='verifying',restore_started_at=$2,updated_at=now()
		WHERE id=$1`, id, startedAt)
	if err != nil {
		return fmt.Errorf("mark backup verifying: %w", err)
	}
	return expectManifestRow("mark backup verifying", tag.RowsAffected())
}

func (r PostgresManifestRepository) MarkVerified(ctx context.Context, id uuid.UUID, verified ManifestVerified) error {
	tag, err := r.DB.Exec(ctx, `
		UPDATE catalog_backup_manifests
		SET status='verified',restore_started_at=$2,restore_completed_at=$3,
			restore_duration_ms=$4,verification=$5::jsonb,error_summary='',updated_at=now()
		WHERE id=$1`, id, verified.RestoreStartedAt, verified.RestoreCompletedAt,
		verified.RestoreDuration.Milliseconds(), string(verified.Verification))
	if err != nil {
		return fmt.Errorf("mark backup verified: %w", err)
	}
	return expectManifestRow("mark backup verified", tag.RowsAffected())
}

func (r PostgresManifestRepository) MarkFailed(ctx context.Context, id uuid.UUID, summary string) error {
	summary = strings.TrimSpace(summary)
	if len(summary) > 2000 {
		summary = summary[:2000]
	}
	tag, err := r.DB.Exec(ctx, `
		UPDATE catalog_backup_manifests
		SET status='failed',error_summary=$2,completed_at=COALESCE(completed_at,now()),updated_at=now()
		WHERE id=$1`, id, summary)
	if err != nil {
		return fmt.Errorf("mark backup failed: %w", err)
	}
	return expectManifestRow("mark backup failed", tag.RowsAffected())
}

func expectManifestRow(operation string, rows int64) error {
	if rows != 1 {
		return fmt.Errorf("%s: expected one row, got %d", operation, rows)
	}
	return nil
}
