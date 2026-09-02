package catalogmedia

import (
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	db          *pgxpool.Pool
	root        *os.Root
	environment string
	accessMode  string
}

func NewHandler(db *pgxpool.Pool, root, environment string) (*Handler, error) {
	return NewHandlerWithAccessMode(db, root, environment, "public")
}

func NewHandlerWithAccessMode(db *pgxpool.Pool, root, environment, accessMode string) (*Handler, error) {
	if db == nil || !filepath.IsAbs(root) {
		return nil, errors.New("media handler requires a database and absolute cache directory")
	}
	if environment != "development" && environment != "staging" && environment != "production" {
		return nil, errors.New("media handler environment is invalid")
	}
	if accessMode != "public" && accessMode != "private" {
		return nil, errors.New("media handler access mode is invalid")
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	rootHandle, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, err
	}
	return &Handler{db: db, root: rootHandle, environment: environment, accessMode: accessMode}, nil
}

func (h *Handler) Close() error {
	if h == nil || h.root == nil {
		return nil
	}
	return h.root.Close()
}

func (h *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		response.Header().Set("Allow", "GET, HEAD")
		http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id, err := uuid.Parse(strings.TrimPrefix(request.URL.Path, "/v1/media/"))
	if err != nil {
		http.NotFound(response, request)
		return
	}
	var key, mimeType string
	var hash []byte
	// Publication is open (owner decision 2026-09-02): serve any cached media
	// of a published entity whose source artifact is proven; the source policy
	// only contributes an optional retention window.
	query := `
		SELECT media.cache_key,media.mime_type,media.cached_content_hash
		FROM catalog_entity_media media
		JOIN game_entities entity ON entity.id=media.entity_id
		JOIN game_entity_versions published ON published.id=entity.published_version_id
		JOIN game_builds published_build ON published_build.id=published.build_id
		  AND published_build.product_id=entity.product_id
		JOIN game_builds media_build ON media_build.id=media.build_id
		  AND media_build.product_id=entity.product_id
		JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
		JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
		LEFT JOIN catalog_source_policies policy ON policy.source=media.source
		WHERE media.id=$1 AND media.cache_status='cached'
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND media_build.build_number<=published_build.build_number
		  AND (policy.retention_days IS NULL OR media.cached_at>now()-make_interval(days=>policy.retention_days))`
	args := []any{id}
	err = h.db.QueryRow(request.Context(), query, args...).Scan(&key, &mimeType, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(response, request)
		return
	}
	if err != nil || !validCacheKey(key) {
		http.Error(response, "media unavailable", http.StatusServiceUnavailable)
		return
	}
	file, err := h.root.Open(filepath.FromSlash(key))
	if err != nil {
		http.NotFound(response, request)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(response, request)
		return
	}
	response.Header().Set("Content-Type", mimeType)
	if h.accessMode == "private" {
		response.Header().Set("Cache-Control", "private, no-store")
	} else {
		response.Header().Set("Cache-Control", "public, max-age=300, must-revalidate")
	}
	response.Header().Set("ETag", `"sha256-`+hex.EncodeToString(hash)+`"`)
	response.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(response, request, filepath.Base(key), info.ModTime(), file)
}

func validCacheKey(key string) bool {
	if strings.Contains(key, "\\") || strings.Contains(key, "..") || filepath.IsAbs(key) {
		return false
	}
	parts := strings.Split(key, "/")
	return len(parts) == 2 && len(parts[0]) == 2 && len(parts[1]) >= 67
}
