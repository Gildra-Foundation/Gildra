package genshin

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

const mediaBase = "/genshin-impact/media/"

var mediaStorageKey = regexp.MustCompile(`^genshin/[0-9a-f]{64}\.png$`)

type MediaHandler struct {
	root string
}

func NewMediaHandler(root string) (*MediaHandler, error) {
	if root == "" {
		return nil, errors.New("genshin media root is required")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve genshin media root: %w", err)
	}
	return &MediaHandler{root: absolute}, nil
}

func (h *MediaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	storageKey := strings.TrimPrefix(r.URL.Path, mediaBase)
	if !mediaStorageKey.MatchString(storageKey) {
		http.NotFound(w, r)
		return
	}
	filePath := filepath.Join(h.root, filepath.FromSlash(storageKey))
	file, err := os.Open(filePath)
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
	hash := strings.TrimSuffix(filepath.Base(storageKey), ".png")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("ETag", `"`+hash+`"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(storageKey), info.ModTime(), file)
}
