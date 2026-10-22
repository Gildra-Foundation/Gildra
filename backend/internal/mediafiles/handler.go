// Package mediafiles serves content-addressed images (<sha256>.<ext>) that
// importers stored under a media directory.
package mediafiles

import (
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var mimeTypes = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}

// Handler serves files below root whose path after base matches key.
type Handler struct {
	root string
	base string
	key  *regexp.Regexp
}

// NewHandler serves base+<storage key> from root. key must only match
// relative paths ending in a supported image extension; label names the
// media set in errors.
func NewHandler(root, base string, key *regexp.Regexp, label string) (*Handler, error) {
	if root == "" {
		return nil, fmt.Errorf("%s media root is required", label)
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve %s media root: %w", label, err)
	}
	return &Handler{root: absolute, base: base, key: key}, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	storageKey := strings.TrimPrefix(r.URL.Path, h.base)
	extension := filepath.Ext(storageKey)
	mimeType, supported := mimeTypes[extension]
	if !supported || !h.key.MatchString(storageKey) {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(filepath.Join(h.root, filepath.FromSlash(storageKey)))
	if errors.Is(err, fs.ErrNotExist) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "media unavailable", http.StatusServiceUnavailable)
		return
	}
	defer file.Close() //nolint:errcheck
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	hash := strings.TrimSuffix(filepath.Base(storageKey), extension)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("ETag", `"`+hash+`"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(storageKey), info.ModTime(), file)
}
