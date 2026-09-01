package catalogmedia

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
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
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.UserAgent() != catalogMediaUserAgent {
			return nil, fmt.Errorf("User-Agent = %q, want %q", request.UserAgent(), catalogMediaUserAgent)
		}
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

func TestOfficialIconURL(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "normalizes", input: " Spell_Fire_Flamebolt ", want: "https://render.worldofwarcraft.com/eu/icons/56/spell_fire_flamebolt.jpg"},
		{name: "rejects path", input: "../secret", wantErr: true},
		{name: "rejects empty", input: " ", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := officialIconURL(test.input)
			if test.wantErr {
				if err == nil {
					t.Fatalf("officialIconURL(%q) unexpectedly succeeded with %q", test.input, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("officialIconURL(%q)=%q error=%v, want %q", test.input, got, err, test.want)
			}
		})
	}
}

func TestWagoCASCIconURL(t *testing.T) {
	t.Parallel()
	got, err := wagoCASCIconURL(5351060, "wow", "12.1.0.69497")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://wago.tools/api/casc/5351060?product=wow&version=12.1.0.69497"
	if got != want {
		t.Fatalf("wagoCASCIconURL=%q, want %q", got, want)
	}
	if _, err := wagoCASCIconURL(0, "wow", "12.1.0.69497"); err == nil {
		t.Fatal("wagoCASCIconURL unexpectedly accepted FileDataID 0")
	}
}

func TestFetchWagoCASCIconConvertsAndCachesPNG(t *testing.T) {
	t.Parallel()
	raw := syntheticBLP2(2, 0, 0, []byte{0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0})
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		want := "https://wago.tools/api/casc/5351060?product=wow&version=12.1.0.69497"
		if request.URL.String() != want {
			t.Fatalf("fallback URL=%q, want %q", request.URL, want)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewReader(raw)),
			Header:     make(http.Header),
		}, nil
	})}
	root := t.TempDir()
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rootHandle.Close() })
	cache := &Cache{rootPath: root, root: rootHandle, client: client}
	fileDataID := int64(5351060)
	icon, err := cache.fetchWagoCASCIcon(context.Background(), iconCandidate{
		Name: "10_2_raidability_flamingtree", FileDataID: &fileDataID,
	}, "wow", "12.1.0.69497")
	if err != nil {
		t.Fatal(err)
	}
	if icon.Source != "wago_tools" || icon.AssetKey != "wago_casc_icon_png" ||
		icon.CachedMIMEType != "image/png" || icon.Width != 4 || icon.Height != 4 ||
		icon.Conversion != "blp2_to_png" || len(icon.SourceHash) != 32 || len(icon.CachedHash) != 32 {
		t.Fatalf("unexpected cached fallback: %#v", icon)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(icon.CacheKey))); err != nil {
		t.Fatalf("cached fallback object: %v", err)
	}
}

func TestFetchWagoCASCIconFallsBackToExactUnpinnedFileDataID(t *testing.T) {
	t.Parallel()
	raw := syntheticBLP2(2, 0, 0, []byte{0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0})
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		body := []byte{}
		if request.URL.String() == "https://wago.tools/api/casc/7578215" {
			body = raw
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	})}
	root := t.TempDir()
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rootHandle.Close() })
	cache := &Cache{rootPath: root, root: rootHandle, client: client}
	fileDataID := int64(7578215)
	icon, err := cache.fetchWagoCASCIcon(context.Background(), iconCandidate{
		Name: "inv_12_jewelryandtrinkets_raid_darkwell_tank2_phoenixegg", FileDataID: &fileDataID,
	}, "wow", "12.1.0.69497")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || icon.SourceURL != "https://wago.tools/api/casc/7578215" ||
		icon.Conversion != "blp2_to_png_unpinned_casc" {
		t.Fatalf("calls=%d source=%q conversion=%q", calls, icon.SourceURL, icon.Conversion)
	}
}
