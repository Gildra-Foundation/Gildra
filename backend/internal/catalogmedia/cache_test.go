package catalogmedia

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestFetchStoresContentAddressedImage(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	client := &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(png)), Header: make(http.Header)}, nil
	})}
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rootHandle.Close() })
	cache := &Cache{rootPath: root, root: rootHandle, client: client}
	key, mimeType, size, hash, err := cache.fetch(context.Background(), "https://example.com/icon")
	if err != nil {
		t.Fatal(err)
	}
	if mimeType != "image/png" || size != int64(len(png)) || len(hash) != 32 {
		t.Fatalf("mime=%q size=%d hash=%d", mimeType, size, len(hash))
	}
	info, err := os.Stat(filepath.Join(root, filepath.FromSlash(key)))
	if err != nil || info.Size() != int64(len(png)) {
		t.Fatalf("cached object: info=%v error=%v", info, err)
	}
	secondKey, _, _, _, err := cache.fetch(context.Background(), "https://example.com/icon")
	if err != nil || secondKey != key {
		t.Fatalf("deduplicated key=%q want=%q error=%v", secondKey, key, err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestValidateRemoteURLRejectsPrivateIP(t *testing.T) {
	for _, raw := range []string{"http://example.com/icon.png", "https://127.0.0.1/icon.png", "https://[::1]/icon.png", "https://user@example.com/icon.png"} {
		if _, err := validateRemoteURL(raw); err == nil {
			t.Fatalf("validateRemoteURL(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestValidCacheKeyRejectsTraversal(t *testing.T) {
	if validCacheKey("../secret.png") || validCacheKey("aa/../secret.png") {
		t.Fatal("cache key traversal was accepted")
	}
}

func TestNewRejectsNonOriginPublicBase(t *testing.T) {
	for _, raw := range []string{
		"http://api.gildra.net",
		"https://api.gildra.net/path",
		"https://api.gildra.net?token=secret",
		"https://api.gildra.net#fragment",
		"https://user@api.gildra.net",
	} {
		if _, err := New(&pgxpool.Pool{}, t.TempDir(), raw, nil); err == nil {
			t.Fatalf("New accepted non-origin public base %q", raw)
		}
	}
}
