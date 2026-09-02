package genshinimport

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
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

func TestMediaFetcherUsesAlternateLocalMirrorForOptionalAssets(t *testing.T) {
	var content bytes.Buffer
	if err := png.Encode(&content, image.NewRGBA(image.Rect(0, 0, 4, 5))); err != nil {
		t.Fatal(err)
	}
	primary := httptest.NewServer(http.NotFoundHandler())
	t.Cleanup(primary.Close)
	alternate := t.TempDir()
	if err := os.WriteFile(filepath.Join(alternate, "UI_Optional.png"), content.Bytes(), 0o640); err != nil {
		t.Fatal(err)
	}

	fetcher, err := NewMediaFetcher(t.TempDir(), primary.URL, 1)
	if err != nil {
		t.Fatal(err)
	}
	if err := fetcher.SetAlternateMediaSource(alternate, "https://example.test/genshin"); err != nil {
		t.Fatal(err)
	}
	assets, err := fetcher.FetchOptional(t.Context(), []string{"UI_Optional"})
	if err != nil {
		t.Fatal(err)
	}
	asset := assets["UI_Optional"]
	if asset.Width != 4 || asset.Height != 5 || asset.FetchedAs != "UI_Optional" {
		t.Fatalf("asset = %+v", asset)
	}
	if asset.SourceURL != "https://example.test/genshin/UI_Optional.png" {
		t.Fatalf("source URL = %q", asset.SourceURL)
	}
}

func TestMediaFetcherDownloadsOptionalExternalPNGURL(t *testing.T) {
	var content bytes.Buffer
	if err := png.Encode(&content, image.NewRGBA(image.Rect(0, 0, 3, 2))); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/UI_External.png" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(content.Bytes())
	}))
	t.Cleanup(server.Close)

	root := t.TempDir()
	fetcher, err := NewMediaFetcher(root, "https://primary.example/ui", 1)
	if err != nil {
		t.Fatal(err)
	}
	source := server.URL + "/UI_External.png"
	assets, err := fetcher.FetchOptional(t.Context(), []string{source})
	if err != nil {
		t.Fatal(err)
	}
	asset := assets[source]
	if asset.Width != 3 || asset.Height != 2 || asset.SourceURL != source {
		t.Fatalf("asset = %+v", asset)
	}
}

func TestMediaFetcherNormalizesOptionalExternalJPEGURL(t *testing.T) {
	var content bytes.Buffer
	if err := jpeg.Encode(&content, image.NewRGBA(image.Rect(0, 0, 5, 4)), &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/event.jpg" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(content.Bytes())
	}))
	t.Cleanup(server.Close)

	root := t.TempDir()
	fetcher, err := NewMediaFetcher(root, "https://primary.example/ui", 1)
	if err != nil {
		t.Fatal(err)
	}
	source := server.URL + "/event.jpg"
	assets, err := fetcher.FetchOptional(t.Context(), []string{source})
	if err != nil {
		t.Fatal(err)
	}
	asset := assets[source]
	if asset.Width != 5 || asset.Height != 4 || asset.MIMEType != "image/png" {
		t.Fatalf("asset = %+v", asset)
	}
	stored, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(asset.StorageKey)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := png.DecodeConfig(bytes.NewReader(stored)); err != nil {
		t.Fatalf("stored JPEG was not normalized to PNG: %v", err)
	}
}
