package catalogmedia

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxAssetBytes = 32 << 20

type Cache struct {
	db         *pgxpool.Pool
	rootPath   string
	root       *os.Root
	publicBase string
	client     *http.Client
}

type Result struct {
	Eligible int64 `json:"eligible"`
	Cached   int64 `json:"cached"`
	Failed   int64 `json:"failed"`
	Skipped  int64 `json:"skipped"`
	Bytes    int64 `json:"bytes"`
}

type candidate struct {
	id        uuid.UUID
	sourceURL string
	status    string
}

func New(db *pgxpool.Pool, root, publicBase string, client *http.Client) (*Cache, error) {
	if db == nil {
		return nil, errors.New("media cache database is required")
	}
	if !filepath.IsAbs(root) {
		return nil, errors.New("media cache directory must be absolute")
	}
	base, err := url.Parse(strings.TrimRight(strings.TrimSpace(publicBase), "/"))
	if err != nil || base.Scheme != "https" || base.Hostname() == "" || base.Path != "" ||
		base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("media public base URL must be an HTTPS origin")
	}
	if err := os.MkdirAll(root, 0o750); err != nil {
		return nil, fmt.Errorf("create media cache directory: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, fmt.Errorf("resolve media cache directory: %w", err)
	}
	if client == nil {
		client = SafeHTTPClient(30 * time.Second)
	}
	rootHandle, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, fmt.Errorf("open media cache root: %w", err)
	}
	return &Cache{db: db, rootPath: resolved, root: rootHandle, publicBase: base.String(), client: client}, nil
}

func (c *Cache) Close() error {
	if c == nil || c.root == nil {
		return nil
	}
	return c.root.Close()
}

func (c *Cache) Run(ctx context.Context, environment string, limit int) (Result, error) {
	return c.RunWithAccessMode(ctx, environment, limit, "public")
}

func (c *Cache) RunWithAccessMode(ctx context.Context, environment string, limit int, accessMode string) (Result, error) {
	if environment != "development" && environment != "staging" && environment != "production" {
		return Result{}, errors.New("invalid media cache environment")
	}
	if accessMode != "public" && accessMode != "private" {
		return Result{}, errors.New("invalid media cache access mode")
	}
	if limit < 1 || limit > 10000 {
		return Result{}, errors.New("media cache limit must be between 1 and 10000")
	}
	var locked bool
	if err := c.db.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext('gildra_media_cache:'||$1))`, environment).Scan(&locked); err != nil {
		return Result{}, fmt.Errorf("acquire media cache lock: %w", err)
	}
	if !locked {
		return Result{}, errors.New("another media cache run is active")
	}
	defer c.db.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock(hashtext('gildra_media_cache:'||$1))`, environment) //nolint:errcheck

	runID := uuid.New()
	if _, err := c.db.Exec(ctx, `INSERT INTO catalog_media_cache_runs(id,environment,status,requested_limit) VALUES($1,$2,'running',$3)`, runID, environment, limit); err != nil {
		return Result{}, fmt.Errorf("start media cache run: %w", err)
	}
	result, runErr := c.runCandidates(ctx, environment, limit, accessMode)
	if runErr == nil && result.Cached > 0 {
		if _, err := c.db.Exec(ctx, `SELECT refresh_catalog_library_media_previews(NULL)`); err != nil {
			runErr = fmt.Errorf("refresh library media previews: %w", err)
		}
	}
	status, message := "succeeded", ""
	if runErr != nil {
		status, message = "failed", runErr.Error()
	} else if result.Failed > 0 {
		status = "partial"
	}
	_, finishErr := c.db.Exec(context.WithoutCancel(ctx), `UPDATE catalog_media_cache_runs SET status=$2,eligible_count=$3,cached_count=$4,failed_count=$5,skipped_count=$6,byte_size=$7,error_message=$8,completed_at=now() WHERE id=$1`, runID, status, result.Eligible, result.Cached, result.Failed, result.Skipped, result.Bytes, message)
	return result, errors.Join(runErr, finishErr)
}

func (c *Cache) runCandidates(ctx context.Context, environment string, limit int, accessMode string) (Result, error) {
	query := `
		SELECT media.id,media.source_url,media.cache_status,count(*) OVER()
		FROM catalog_entity_media media
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
		JOIN catalog_source_policies policy ON policy.source=media.source
		JOIN catalog_publication_grants permission ON permission.source=media.source AND permission.environment=$1 AND permission.surface='asset_cache'
		JOIN catalog_source_policy_reviews permission_review ON permission_review.id=permission.policy_review_id
		WHERE (media.cache_status IN ('remote','failed') OR
		       media.cache_status='cached' AND policy.retention_days IS NOT NULL AND
		       media.cached_at<=now()-make_interval(days=>policy.retention_days))
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND policy.review_status='reviewed' AND policy.asset_caching_status IN ('allowed','restricted','permission_required')
		  AND permission.decision='allowed' AND permission.reviewed_at IS NOT NULL
		  AND (permission.expires_at IS NULL OR permission.expires_at>now())
		  AND permission_review.source=permission.source
		  AND permission_review.environment=permission.environment
		  AND permission_review.surface=permission.surface
		  AND permission_review.decision='allowed'
		  AND permission_review.review_kind IN ('owner_approval','legal')
		  AND (permission_review.expires_at IS NULL OR permission_review.expires_at>now())
		ORDER BY COALESCE(media.cached_at,'-infinity'::timestamptz),media.updated_at,media.id LIMIT $2`
	args := []any{environment, limit}
	if accessMode == "private" {
		query = `
		SELECT media.id,media.source_url,media.cache_status,count(*) OVER()
		FROM catalog_entity_media media
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
		JOIN catalog_source_policies policy ON policy.source=media.source
		WHERE (media.cache_status IN ('remote','failed') OR
		       media.cache_status='cached' AND policy.retention_days IS NOT NULL AND
		       media.cached_at<=now()-make_interval(days=>policy.retention_days))
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND policy.review_status='reviewed'
		ORDER BY COALESCE(media.cached_at,'-infinity'::timestamptz),media.updated_at,media.id LIMIT $1`
		args = []any{limit}
	}
	rows, err := c.db.Query(ctx, query, args...)
	if err != nil {
		return Result{}, fmt.Errorf("list eligible media: %w", err)
	}
	defer rows.Close()
	var candidates []candidate
	result := Result{}
	for rows.Next() {
		var item candidate
		if err := rows.Scan(&item.id, &item.sourceURL, &item.status, &result.Eligible); err != nil {
			return result, fmt.Errorf("scan eligible media: %w", err)
		}
		candidates = append(candidates, item)
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("iterate eligible media: %w", err)
	}
	for _, item := range candidates {
		key, mimeType, size, hash, err := c.fetch(ctx, item.sourceURL)
		if err != nil {
			// A canceled run is an operational interruption, not a bad asset.
			// Keep remote/cached state intact so a retry can pick it up without
			// turning thousands of in-flight downloads into false failures.
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return result, err
			}
			result.Failed++
			if item.status == "cached" {
				_, _ = c.db.Exec(context.WithoutCancel(ctx), `UPDATE catalog_entity_media SET cache_error=$2,updated_at=now() WHERE id=$1 AND cache_status='cached'`, item.id, truncateError(err))
			} else {
				_, _ = c.db.Exec(context.WithoutCancel(ctx), `UPDATE catalog_entity_media SET cache_status='failed',cache_error=$2,updated_at=now() WHERE id=$1 AND cache_status IN ('remote','failed')`, item.id, truncateError(err))
			}
			continue
		}
		publicURL := c.publicBase + "/v1/media/" + item.id.String()
		command, err := c.db.Exec(ctx, `UPDATE catalog_entity_media SET cache_status='cached',cache_key=$2,cached_url=$3,cached_content_hash=$4,cached_byte_size=$5,cached_at=now(),cache_error='',mime_type=$6,updated_at=now() WHERE id=$1 AND cache_status IN ('remote','failed','cached')`, item.id, key, publicURL, hash, size, mimeType)
		if err != nil {
			return result, fmt.Errorf("publish cached media metadata: %w", err)
		}
		if command.RowsAffected() == 0 {
			result.Skipped++
			continue
		}
		result.Cached++
		result.Bytes += size
	}
	return result, nil
}

func (c *Cache) fetch(ctx context.Context, sourceURL string) (string, string, int64, []byte, error) {
	parsed, err := validateRemoteURL(sourceURL)
	if err != nil {
		return "", "", 0, nil, err
	}
	response, err := doMediaRequest(ctx, c.client, parsed)
	if err != nil {
		return "", "", 0, nil, fmt.Errorf("download media: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", "", 0, nil, fmt.Errorf("download media: HTTP %d", response.StatusCode)
	}
	temporary, err := os.CreateTemp(c.rootPath, ".gildra-media-*.tmp")
	if err != nil {
		return "", "", 0, nil, err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	hasher := sha256.New()
	reader := io.LimitReader(response.Body, maxAssetBytes+1)
	size, copyErr := io.Copy(io.MultiWriter(temporary, hasher), reader)
	closeErr := temporary.Close()
	if copyErr != nil || closeErr != nil {
		return "", "", 0, nil, errors.Join(copyErr, closeErr)
	}
	if size == 0 || size > maxAssetBytes {
		return "", "", 0, nil, errors.New("media asset is empty or exceeds 32 MiB")
	}
	probe, err := os.Open(temporaryName)
	if err != nil {
		return "", "", 0, nil, err
	}
	header := make([]byte, 512)
	n, readErr := probe.Read(header)
	probe.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return "", "", 0, nil, readErr
	}
	mimeType := http.DetectContentType(header[:n])
	extension, ok := imageExtension(mimeType)
	if !ok {
		return "", "", 0, nil, fmt.Errorf("unsupported media MIME type %q", mimeType)
	}
	hash := hasher.Sum(nil)
	hexHash := hex.EncodeToString(hash)
	key := filepath.ToSlash(filepath.Join(hexHash[:2], hexHash+extension))
	if err := c.root.MkdirAll(hexHash[:2], 0o750); err != nil {
		return "", "", 0, nil, err
	}
	if err := c.root.Link(filepath.Base(temporaryName), filepath.FromSlash(key)); err != nil && !errors.Is(err, os.ErrExist) {
		return "", "", 0, nil, fmt.Errorf("publish media object: %w", err)
	}
	return key, mimeType, size, hash, nil
}

func (c *Cache) cacheImageBytes(content []byte, mimeType string) (string, int64, []byte, error) {
	if len(content) == 0 || len(content) > maxAssetBytes {
		return "", 0, nil, errors.New("generated media asset is empty or exceeds 32 MiB")
	}
	extension, ok := imageExtension(mimeType)
	if !ok {
		return "", 0, nil, fmt.Errorf("unsupported generated media MIME type %q", mimeType)
	}
	hashArray := sha256.Sum256(content)
	hash := hashArray[:]
	hexHash := hex.EncodeToString(hash)
	key := filepath.ToSlash(filepath.Join(hexHash[:2], hexHash+extension))
	if err := c.root.MkdirAll(hexHash[:2], 0o750); err != nil {
		return "", 0, nil, err
	}
	temporary, err := os.CreateTemp(c.rootPath, ".gildra-generated-media-*.tmp")
	if err != nil {
		return "", 0, nil, err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if _, writeErr := temporary.Write(content); writeErr != nil {
		_ = temporary.Close()
		return "", 0, nil, writeErr
	}
	if err := temporary.Close(); err != nil {
		return "", 0, nil, err
	}
	if err := c.root.Link(filepath.Base(temporaryName), filepath.FromSlash(key)); err != nil && !errors.Is(err, os.ErrExist) {
		return "", 0, nil, fmt.Errorf("publish generated media object: %w", err)
	}
	return key, int64(len(content)), hash, nil
}

func imageExtension(mimeType string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0])) {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	default:
		return "", false
	}
}

func truncateError(err error) string {
	value := err.Error()
	if len(value) > 1000 {
		return value[:1000]
	}
	return value
}
