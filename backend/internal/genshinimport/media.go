package genshinimport

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
)

const maxMediaBytes = 8 << 20

var mediaFilename = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

type MediaAsset struct {
	Filename   string
	StorageKey string
	SHA256     string
	MIMEType   string
	ByteSize   int64
	Width      int
	Height     int
	SourceURL  string
	FetchedAs  string
	Fallback   bool
}

type MediaFetcher struct {
	root             string
	baseURL          *url.URL
	alternateRoot    string
	alternateBaseURL *url.URL
	client           *http.Client
	workers          int
}

func NewMediaFetcher(root, baseURL string, workers int) (*MediaFetcher, error) {
	if root == "" {
		return nil, errors.New("genshin media directory is required")
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve genshin media directory: %w", err)
	}
	parsedBase, err := url.Parse(baseURL)
	if err != nil || parsedBase.Host == "" || (parsedBase.Scheme != "https" && parsedBase.Scheme != "http") {
		return nil, fmt.Errorf("invalid genshin media base URL %q", baseURL)
	}
	if workers < 1 || workers > 32 {
		return nil, errors.New("genshin media workers must be between 1 and 32")
	}
	return &MediaFetcher{
		root:    absoluteRoot,
		baseURL: parsedBase,
		workers: workers,
		client: &http.Client{
			Timeout: 45 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        64,
				MaxIdleConnsPerHost: workers,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}, nil
}

// SetAlternateMediaSource configures an optional local mirror used for
// client-only catalog assets that are not published by the primary provider.
// The mirror is intentionally used only by FetchOptional; strict core assets
// continue to come from the primary source and fail the import when missing.
func (f *MediaFetcher) SetAlternateMediaSource(root, baseURL string) error {
	if root == "" {
		return errors.New("alternate genshin media directory is required")
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve alternate genshin media directory: %w", err)
	}
	parsedBase, err := url.Parse(baseURL)
	if err != nil || parsedBase.Host == "" || (parsedBase.Scheme != "https" && parsedBase.Scheme != "http") {
		return fmt.Errorf("invalid alternate genshin media base URL %q", baseURL)
	}
	f.alternateRoot = absoluteRoot
	f.alternateBaseURL = parsedBase
	return nil
}

func (f *MediaFetcher) Fetch(ctx context.Context, filenames []string, fallbacks map[string]string) (map[string]MediaAsset, error) {
	directory := filepath.Join(f.root, "genshin")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return nil, fmt.Errorf("create genshin media directory: %w", err)
	}
	assets := make([]MediaAsset, len(filenames))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(f.workers)
	for index, filename := range filenames {
		group.Go(func() error {
			asset, err := f.fetchOne(groupCtx, directory, filename, fallbacks[filename])
			if err != nil {
				return fmt.Errorf("download genshin media %q: %w", filename, err)
			}
			assets[index] = asset
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	byFilename := make(map[string]MediaAsset, len(assets))
	for _, asset := range assets {
		byFilename[asset.Filename] = asset
	}
	return byFilename, nil
}

// FetchOptional caches the first presentation image for generic source
// records. Missing client-only assets are deliberately ignored; the source
// JSON still retains their original filename for future providers.
func (f *MediaFetcher) FetchOptional(ctx context.Context, filenames []string) (map[string]MediaAsset, error) {
	directory := filepath.Join(f.root, "genshin")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return nil, fmt.Errorf("create genshin media directory: %w", err)
	}
	assets := make([]MediaAsset, len(filenames))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(f.workers)
	for index, filename := range filenames {
		group.Go(func() error {
			if strings.HasPrefix(filename, "https://") || strings.HasPrefix(filename, "http://") {
				asset, err := f.downloadExternal(groupCtx, directory, filename)
				if err == nil {
					assets[index] = asset
					return nil
				}
				slog.Warn("genshin external media unavailable", "filename", filename, "error", err)
				return nil
			}
			asset, found, err := f.downloadAlternate(groupCtx, directory, filename)
			if found {
				if err != nil {
					slog.Warn("genshin alternate media unavailable", "filename", filename, "error", err)
				} else {
					assets[index] = asset
					return nil
				}
			}
			asset, notFound, err := f.download(groupCtx, directory, filename, filename)
			if err != nil {
				// Generic records include client-only assets as well as files
				// that can transiently disappear upstream. Keep the source
				// reference in the database and let the rest of the import
				// complete when an optional file is unavailable.
				if !notFound {
					slog.Warn("genshin optional media unavailable", "filename", filename, "error", err)
				}
				return nil
			}
			assets[index] = asset
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	byFilename := make(map[string]MediaAsset, len(assets))
	for _, asset := range assets {
		if asset.Filename != "" {
			byFilename[asset.Filename] = asset
		}
	}
	return byFilename, nil
}

func (f *MediaFetcher) downloadExternal(ctx context.Context, directory, source string) (MediaAsset, error) {
	parsed, err := url.ParseRequestURI(source)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return MediaAsset{}, fmt.Errorf("invalid external media URL %q", source)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return MediaAsset{}, fmt.Errorf("create external media request: %w", err)
	}
	request.Header.Set("User-Agent", "Gildra-Genshin-Importer/1.0 (+https://api.gildra.net)")
	response, err := f.client.Do(request)
	if err != nil {
		return MediaAsset{}, fmt.Errorf("request external media: %w", err)
	}
	defer response.Body.Close() //nolint:errcheck
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return MediaAsset{}, fmt.Errorf("external media server returned HTTP %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, maxMediaBytes+1))
	if err != nil {
		return MediaAsset{}, fmt.Errorf("read external media: %w", err)
	}
	if len(content) == 0 || len(content) > maxMediaBytes {
		return MediaAsset{}, fmt.Errorf("external media size %d is outside the allowed range", len(content))
	}
	fetched := path.Base(parsed.Path)
	if fetched == "." || fetched == "/" || fetched == "" {
		fetched = "external"
	}
	return f.persist(directory, source, fetched, source, content)
}

func (f *MediaFetcher) downloadAlternate(ctx context.Context, directory, filename string) (MediaAsset, bool, error) {
	if f.alternateRoot == "" || f.alternateBaseURL == nil {
		return MediaAsset{}, false, nil
	}
	if !mediaFilename.MatchString(filename) {
		return MediaAsset{}, true, fmt.Errorf("unsafe media filename %q", filename)
	}
	localName := filename + ".png"
	localPath := filepath.Join(f.alternateRoot, localName)
	content, err := os.ReadFile(localPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return MediaAsset{}, false, nil
		}
		return MediaAsset{}, true, fmt.Errorf("read alternate media %q: %w", filename, err)
	}
	if len(content) == 0 || len(content) > maxMediaBytes {
		return MediaAsset{}, true, fmt.Errorf("alternate media size %d is outside the allowed range", len(content))
	}
	mediaURL := *f.alternateBaseURL
	mediaURL.Path = path.Join(f.alternateBaseURL.Path, localName)
	asset, err := f.persist(directory, filename, filename, mediaURL.String(), content)
	return asset, true, err
}

func (f *MediaFetcher) fetchOne(ctx context.Context, directory, filename, fallback string) (MediaAsset, error) {
	if !mediaFilename.MatchString(filename) {
		return MediaAsset{}, fmt.Errorf("unsafe media filename %q", filename)
	}
	if fallback != "" && !mediaFilename.MatchString(fallback) {
		return MediaAsset{}, fmt.Errorf("unsafe fallback media filename %q", fallback)
	}
	asset, notFound, err := f.download(ctx, directory, filename, filename)
	if err == nil {
		return asset, nil
	}
	if !notFound || fallback == "" {
		return MediaAsset{}, err
	}
	slog.Warn("genshin media missing upstream; using related character icon", "requested", filename, "fallback", fallback)
	asset, _, fallbackErr := f.download(ctx, directory, filename, fallback)
	if fallbackErr != nil {
		return MediaAsset{}, fmt.Errorf("requested media was not found and fallback %q failed: %w", fallback, fallbackErr)
	}
	asset.Fallback = true
	return asset, nil
}

func (f *MediaFetcher) download(ctx context.Context, directory, requested, fetched string) (MediaAsset, bool, error) {
	mediaURL := *f.baseURL
	mediaURL.Path = path.Join(f.baseURL.Path, fetched+".png")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL.String(), nil)
	if err != nil {
		return MediaAsset{}, false, fmt.Errorf("create media request: %w", err)
	}
	request.Header.Set("User-Agent", "Gildra-Genshin-Importer/1.0 (+https://api.gildra.net)")
	response, err := f.client.Do(request)
	if err != nil {
		return MediaAsset{}, false, fmt.Errorf("request media: %w", err)
	}
	defer response.Body.Close() //nolint:errcheck
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return MediaAsset{}, response.StatusCode == http.StatusNotFound, fmt.Errorf("media server returned HTTP %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, maxMediaBytes+1))
	if err != nil {
		return MediaAsset{}, false, fmt.Errorf("read media: %w", err)
	}
	if len(content) == 0 || len(content) > maxMediaBytes {
		return MediaAsset{}, false, fmt.Errorf("media size %d is outside the allowed range", len(content))
	}
	asset, err := f.persist(directory, requested, fetched, mediaURL.String(), content)
	return asset, false, err
}

func (f *MediaFetcher) persist(directory, requested, fetched, sourceURL string, content []byte) (MediaAsset, error) {
	config, err := png.DecodeConfig(bytes.NewReader(content))
	if err != nil {
		return MediaAsset{}, fmt.Errorf("decode PNG metadata: %w", err)
	}
	digest := sha256.Sum256(content)
	digestText := hex.EncodeToString(digest[:])
	storageKey := "genshin/" + digestText + ".png"
	destination := filepath.Join(directory, digestText+".png")
	if err := persistMedia(destination, content, digest); err != nil {
		return MediaAsset{}, err
	}
	return MediaAsset{
		Filename:   requested,
		StorageKey: storageKey,
		SHA256:     digestText,
		MIMEType:   "image/png",
		ByteSize:   int64(len(content)),
		Width:      config.Width,
		Height:     config.Height,
		SourceURL:  sourceURL,
		FetchedAs:  fetched,
	}, nil
}

func persistMedia(destination string, content []byte, expected [sha256.Size]byte) (returnErr error) {
	if existing, err := os.ReadFile(destination); err == nil {
		if sha256.Sum256(existing) != expected {
			return fmt.Errorf("existing media checksum mismatch at %q", destination)
		}
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read existing media %q: %w", destination, err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(destination), ".genshin-media-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary media: %w", err)
	}
	temporaryName := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			if closeErr := temporary.Close(); returnErr == nil {
				returnErr = closeErr
			}
		}
		_ = os.Remove(temporaryName)
	}()
	if err := temporary.Chmod(0o640); err != nil {
		return fmt.Errorf("set temporary media permissions: %w", err)
	}
	if _, err := temporary.Write(content); err != nil {
		return fmt.Errorf("write temporary media: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary media: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary media: %w", err)
	}
	closed = true
	if err := os.Rename(temporaryName, destination); err != nil {
		return fmt.Errorf("publish media file: %w", err)
	}
	return nil
}
