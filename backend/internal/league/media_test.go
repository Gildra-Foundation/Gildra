package league

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMediaHandlerRejectsTraversal(t *testing.T) {
	handler, err := NewMediaHandler(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, mediaBase+"../secret.png", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status=%d", response.Code)
	}
}
func TestMediaHandlerServesImmutableImage(t *testing.T) {
	root := t.TempDir()
	hash := strings.Repeat("a", 64)
	directory := filepath.Join(root, "lol")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, hash+".png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	handler, _ := NewMediaHandler(root)
	request := httptest.NewRequest(http.MethodGet, mediaBase+"lol/"+hash+".png", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("status=%d", response.Code)
	}
	if !strings.Contains(response.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("cache=%q", response.Header().Get("Cache-Control"))
	}
}
