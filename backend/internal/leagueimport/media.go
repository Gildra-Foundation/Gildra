package leagueimport

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

const maxMediaBytes = 24 << 20

type MediaAsset struct {
	StorageKey string
	SHA256     string
	MIMEType   string
	ByteSize   int64
	Width      int
	Height     int
	SourceURL  string
}

type MediaFetcher struct {
	client  *http.Client
	root    string
	workers int
}

func NewMediaFetcher(root string, workers int) (*MediaFetcher, error) {
	if root == "" {
		return nil, errors.New("League of Legends media directory is required")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve media directory: %w", err)
	}
	if workers < 1 {
		workers = 12
	}
	return &MediaFetcher{
		client: &http.Client{Timeout: 45 * time.Second}, root: absolute, workers: workers,
	}, nil
}

func (f *MediaFetcher) WithClient(client *http.Client) *MediaFetcher {
	clone := *f
	clone.client = client
	return &clone
}

func (f *MediaFetcher) Fetch(ctx context.Context, urls []string, fallbacks map[string]string) (map[string]MediaAsset, error) {
	assets := make(map[string]MediaAsset, len(urls))
	var mutex sync.Mutex
	group, groupContext := errgroup.WithContext(ctx)
	group.SetLimit(f.workers)
	for _, endpoint := range urls {
		endpoint := endpoint
		group.Go(func() error {
			current := endpoint
			var asset MediaAsset
			var err error
			for attempts := 0; attempts < 4; attempts++ {
				asset, err = f.fetchOne(groupContext, current)
				if err == nil {
					break
				}
				next := fallbacks[current]
				if next == "" || next == current {
					break
				}
				current = next
			}
			if err != nil {
				return fmt.Errorf("download %s: %w", endpoint, err)
			}
			mutex.Lock()
			assets[endpoint] = asset
			mutex.Unlock()
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	return assets, nil
}

func (f *MediaFetcher) fetchOne(ctx context.Context, endpoint string) (MediaAsset, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != "ddragon.leagueoflegends.com" {
		return MediaAsset{}, errors.New("only HTTPS Data Dragon media URLs are allowed")
	}
	if cached, ok := f.cachedAsset(endpoint); ok {
		return cached, nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return MediaAsset{}, err
	}
	request.Header.Set("User-Agent", "Gildra-LoL-Catalog/1.0 (+https://gildra.net)")
	response, err := f.client.Do(request)
	if err != nil {
		return MediaAsset{}, err
	}
	defer response.Body.Close() //nolint:errcheck
	if response.StatusCode != http.StatusOK {
		return MediaAsset{}, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, maxMediaBytes+1))
	if err != nil {
		return MediaAsset{}, err
	}
	if len(content) == 0 || len(content) > maxMediaBytes {
		return MediaAsset{}, fmt.Errorf("image size %d is outside allowed range", len(content))
	}
	mimeType := http.DetectContentType(content)
	extension := ""
	switch mimeType {
	case "image/png":
		extension = "png"
	case "image/jpeg":
		extension = "jpg"
	default:
		return MediaAsset{}, fmt.Errorf("unsupported media type %q", mimeType)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil || config.Width < 1 || config.Height < 1 {
		return MediaAsset{}, errors.New("invalid image payload")
	}
	digest := sha256.Sum256(content)
	hash := hex.EncodeToString(digest[:])
	storageKey := "lol/" + hash + "." + extension
	destination := filepath.Join(f.root, filepath.FromSlash(storageKey))
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return MediaAsset{}, fmt.Errorf("create media directory: %w", err)
	}
	if _, err := os.Stat(destination); errors.Is(err, os.ErrNotExist) {
		temporary, err := os.CreateTemp(filepath.Dir(destination), ".lol-media-*")
		if err != nil {
			return MediaAsset{}, fmt.Errorf("create media temporary file: %w", err)
		}
		temporaryName := temporary.Name()
		cleanup := func() { _ = os.Remove(temporaryName) }
		if err := temporary.Chmod(0o644); err != nil {
			_ = temporary.Close()
			cleanup()
			return MediaAsset{}, fmt.Errorf("set media temporary file permissions: %w", err)
		}
		if _, err := temporary.Write(content); err != nil {
			_ = temporary.Close()
			cleanup()
			return MediaAsset{}, fmt.Errorf("write media temporary file: %w", err)
		}
		if err := temporary.Sync(); err != nil {
			_ = temporary.Close()
			cleanup()
			return MediaAsset{}, fmt.Errorf("sync media temporary file: %w", err)
		}
		if err := temporary.Close(); err != nil {
			cleanup()
			return MediaAsset{}, fmt.Errorf("close media temporary file: %w", err)
		}
		if err := os.Rename(temporaryName, destination); err != nil {
			if _, statErr := os.Stat(destination); statErr != nil {
				cleanup()
				return MediaAsset{}, fmt.Errorf("publish media file: %w", err)
			}
			cleanup()
		}
	} else if err != nil {
		return MediaAsset{}, fmt.Errorf("inspect media file: %w", err)
	}
	asset := MediaAsset{
		StorageKey: storageKey, SHA256: hash, MIMEType: mimeType, ByteSize: int64(len(content)),
		Width: config.Width, Height: config.Height, SourceURL: strings.TrimSpace(endpoint),
	}
	f.cacheAsset(endpoint, asset)
	return asset, nil
}

func (f *MediaFetcher) cachedAsset(endpoint string) (MediaAsset, bool) {
	content, err := os.ReadFile(f.cachePath(endpoint))
	if err != nil {
		return MediaAsset{}, false
	}
	var asset MediaAsset
	if json.Unmarshal(content, &asset) != nil || asset.StorageKey == "" {
		return MediaAsset{}, false
	}
	info, err := os.Stat(filepath.Join(f.root, filepath.FromSlash(asset.StorageKey)))
	if err != nil || !info.Mode().IsRegular() || info.Size() != asset.ByteSize {
		return MediaAsset{}, false
	}
	return asset, true
}

func (f *MediaFetcher) cacheAsset(endpoint string, asset MediaAsset) {
	content, err := json.Marshal(asset)
	if err != nil {
		return
	}
	path := f.cachePath(endpoint)
	if os.MkdirAll(filepath.Dir(path), 0o750) != nil {
		return
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".url-*")
	if err != nil {
		return
	}
	name := temporary.Name()
	defer os.Remove(name) //nolint:errcheck
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return
	}
	if temporary.Close() != nil {
		return
	}
	_ = os.Rename(name, path)
}

func (f *MediaFetcher) cachePath(endpoint string) string {
	digest := sha256.Sum256([]byte(endpoint))
	return filepath.Join(f.root, ".lol-url-cache", hex.EncodeToString(digest[:])+".json")
}
