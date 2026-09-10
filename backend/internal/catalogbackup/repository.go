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

type ExpiredManifest struct {
	ID         uuid.UUID
	StorageURI string
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

// ExpireVerified marks only verified PostgreSQL manifests older than the keep
// window. The update and returned deletion set are one transaction so a
// retention run never deletes an object whose manifest was not expired.
func (r PostgresManifestRepository) ExpireVerified(ctx context.Context, product string, keep int) ([]ExpiredManifest, error) {
	if r.DB == nil {
		return nil, fmt.Errorf("manifest database is required")
	}
	if keep < 1 {
		return nil, fmt.Errorf("verified retention must be at least 1")
	}
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin backup retention: %w", err)
	}
	defer tx.Rollback(ctx) // harmless after a successful commit
	rows, err := tx.Query(ctx, `
		WITH ranked AS (
			SELECT manifest.id,
				ROW_NUMBER() OVER (
					ORDER BY COALESCE(manifest.restore_completed_at, manifest.completed_at, manifest.started_at) DESC,
					manifest.id DESC
				) AS retention_rank
			FROM catalog_backup_manifests manifest
			JOIN game_products product ON product.id = manifest.product_id
			WHERE manifest.component='postgres'
			  AND manifest.status='verified'
			  AND manifest.storage_uri LIKE 'file://%'
			  AND product.slug=$1
		), expired AS (
			UPDATE catalog_backup_manifests manifest
			SET status='expired', updated_at=now()
			FROM ranked
			WHERE manifest.id=ranked.id AND ranked.retention_rank > $2
			RETURNING manifest.id, manifest.storage_uri
		)
		SELECT id, storage_uri FROM expired`, product, keep)
	if err != nil {
		return nil, fmt.Errorf("expire old verified backups: %w", err)
	}
	var expired []ExpiredManifest
	for rows.Next() {
		var item ExpiredManifest
		if err := rows.Scan(&item.ID, &item.StorageURI); err != nil {
			return nil, fmt.Errorf("read expired backup: %w", err)
		}
		expired = append(expired, item)
	}
	rowsErr := rows.Err()
	rows.Close()
	if err := rowsErr; err != nil {
		return nil, fmt.Errorf("iterate expired backups: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit backup retention: %w", err)
	}
	return expired, nil
}

func expectManifestRow(operation string, rows int64) error {
	if rows != 1 {
		return fmt.Errorf("%s: expected one row, got %d", operation, rows)
	}
	return nil
}
