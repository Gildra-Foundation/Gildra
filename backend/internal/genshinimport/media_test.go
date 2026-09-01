package genshinimport

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestMediaFetcher(t *testing.T) {
	var content bytes.Buffer
	picture := image.NewRGBA(image.Rect(0, 0, 2, 3))
	picture.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&content, picture); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/UI_Test.png" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(content.Bytes())
	}))
	t.Cleanup(server.Close)

	root := t.TempDir()
	fetcher, err := NewMediaFetcher(root, server.URL, 2)
	if err != nil {
		t.Fatal(err)
	}
	assets, err := fetcher.Fetch(t.Context(), []string{"UI_Test"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	asset := assets["UI_Test"]
	if asset.Width != 2 || asset.Height != 3 || asset.MIMEType != "image/png" {
		t.Fatalf("asset = %+v", asset)
	}
	stored, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(asset.StorageKey)))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(stored, content.Bytes()) {
		t.Fatal("stored media differs from downloaded media")
	}
}

func TestMediaFetcherUsesFallbackOnlyForNotFound(t *testing.T) {
	var content bytes.Buffer
	if err := png.Encode(&content, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/UI_Character.png" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(content.Bytes())
	}))
	t.Cleanup(server.Close)

	fetcher, err := NewMediaFetcher(t.TempDir(), server.URL, 1)
	if err != nil {
		t.Fatal(err)
	}
	assets, err := fetcher.Fetch(t.Context(), []string{"Skill_Missing"}, map[string]string{"Skill_Missing": "UI_Character"})
	if err != nil {
		t.Fatal(err)
	}
	asset := assets["Skill_Missing"]
	if !asset.Fallback || asset.FetchedAs != "UI_Character" || asset.Filename != "Skill_Missing" {
		t.Fatalf("asset = %+v", asset)
	}
}
