package genshin

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMediaHandler(t *testing.T) {
	root := t.TempDir()
	hash := strings.Repeat("a", 64)
	directory := filepath.Join(root, "genshin")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, hash+".png"), []byte("png"), 0o640); err != nil {
		t.Fatal(err)
	}
	handler, err := NewMediaHandler(root)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name   string
		method string
		path   string
		status int
	}{
		{name: "get", method: http.MethodGet, path: mediaBase + "genshin/" + hash + ".png", status: http.StatusOK},
		{name: "head", method: http.MethodHead, path: mediaBase + "genshin/" + hash + ".png", status: http.StatusOK},
		{name: "missing", method: http.MethodGet, path: mediaBase + "genshin/" + strings.Repeat("b", 64) + ".png", status: http.StatusNotFound},
		{name: "traversal", method: http.MethodGet, path: mediaBase + "../secret", status: http.StatusNotFound},
		{name: "method", method: http.MethodPost, path: mediaBase + "genshin/" + hash + ".png", status: http.StatusMethodNotAllowed},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d", response.Code, test.status)
			}
		})
	}
}
