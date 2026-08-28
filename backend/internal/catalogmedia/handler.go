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
}

func NewHandler(db *pgxpool.Pool, root, environment string) (*Handler, error) {
	if db == nil || !filepath.IsAbs(root) {
		return nil, errors.New("media handler requires a database and absolute cache directory")
	}
	if environment != "development" && environment != "staging" && environment != "production" {
		return nil, errors.New("media handler environment is invalid")
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	rootHandle, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, err
	}
	return &Handler{db: db, root: rootHandle, environment: environment}, nil
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
	err = h.db.QueryRow(request.Context(), `
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
		JOIN catalog_source_policies policy ON policy.source=media.source
		JOIN catalog_publication_grants cache_permission ON cache_permission.source=media.source
		  AND cache_permission.environment=$2 AND cache_permission.surface='asset_cache'
		JOIN catalog_source_policy_reviews cache_review ON cache_review.id=cache_permission.policy_review_id
		JOIN catalog_publication_grants public_permission ON public_permission.source=media.source
		  AND public_permission.environment=$2 AND public_permission.surface='public_api'
		JOIN catalog_source_policy_reviews public_review ON public_review.id=public_permission.policy_review_id
		WHERE media.id=$1 AND media.cache_status='cached' AND policy.review_status='reviewed'
		  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
		  AND media_build.build_number<=published_build.build_number
		  AND policy.asset_caching_status IN ('allowed','restricted','permission_required')
		  AND policy.public_api_status IN ('allowed','restricted','permission_required')
		  AND policy.commercial_use_status IN ('allowed','restricted','permission_required')
		  AND cache_permission.decision='allowed' AND cache_permission.reviewed_at IS NOT NULL
		  AND (cache_permission.expires_at IS NULL OR cache_permission.expires_at>now())
		  AND cache_review.source=cache_permission.source
		  AND cache_review.environment=cache_permission.environment
		  AND cache_review.surface=cache_permission.surface
		  AND cache_review.decision='allowed'
		  AND cache_review.review_kind IN ('owner_approval','legal')
		  AND (cache_review.expires_at IS NULL OR cache_review.expires_at>now())
		  AND public_permission.decision='allowed' AND public_permission.reviewed_at IS NOT NULL
		  AND (public_permission.expires_at IS NULL OR public_permission.expires_at>now())
		  AND public_review.source=public_permission.source
		  AND public_review.environment=public_permission.environment
		  AND public_review.surface=public_permission.surface
		  AND public_review.decision='allowed'
		  AND public_review.review_kind IN ('owner_approval','legal')
		  AND (public_review.expires_at IS NULL OR public_review.expires_at>now())`, id, h.environment).Scan(&key, &mimeType, &hash)
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
	response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
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
