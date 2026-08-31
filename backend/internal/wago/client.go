package wago

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var buildPattern = regexp.MustCompile(`^\d+\.\d+\.\d+\.\d+$`)

const defaultResponseHeaderTimeout = 2 * time.Minute

const maxBuildManifestBytes = 8 << 20

// ErrUnavailable identifies a build/table/locale combination that Wago does
// not publish. A missing DB2 export is different from a transient network
// failure: callers may record it as an explicit source gap and continue with
// the remaining tables while keeping the gap visible to quality reports.
var ErrUnavailable = errors.New("wago artifact unavailable")

type UnavailableError struct {
	Table      string
	Build      string
	Locale     string
	StatusCode int
}

func (e *UnavailableError) Error() string {
	return fmt.Sprintf("Wago DB2 export unavailable: table=%s build=%s locale=%s status=%d", e.Table, e.Build, e.Locale, e.StatusCode)
}

func (e *UnavailableError) Unwrap() error { return ErrUnavailable }

type Client struct {
	baseURL    string
	httpClient *http.Client
	retryMax   int
	retryDelay time.Duration
}

type Config struct {
	BaseURL    string
	HTTPClient *http.Client
	RetryMax   int
	RetryDelay time.Duration
}

type ContentProof struct {
	SHA256   []byte
	ByteSize int64
	ETag     string
	Complete bool
}

type buildManifestEntry struct {
	Version string `json:"version"`
}

type byteCounter int64

func (counter *byteCounter) Write(payload []byte) (int, error) {
	*counter += byteCounter(len(payload))
	return len(payload), nil
}

func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://wago.tools"
	}
	if cfg.HTTPClient == nil {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.MaxIdleConns = 10
		transport.MaxIdleConnsPerHost = 4
		transport.IdleConnTimeout = 90 * time.Second
		// Wago can generate a large locale-specific export before sending the
		// response headers. Keep this bounded independently from the longer
		// whole-table context without treating normal export preparation as a
		// stalled request.
		transport.ResponseHeaderTimeout = defaultResponseHeaderTimeout
		cfg.HTTPClient = &http.Client{
			// DB2 CSV bodies are intentionally streamed and can take longer than
			// a conventional request timeout to project. Callers provide a
			// bounded context for the whole table while the transport separately
			// bounds the connection and response-header phases.
			Transport: transport,
		}
	}
	if cfg.RetryMax == 0 {
		cfg.RetryMax = 3
	}
	if cfg.RetryDelay == 0 {
		cfg.RetryDelay = 2 * time.Second
	}
	return &Client{
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		httpClient: cfg.HTTPClient,
		retryMax:   cfg.RetryMax,
		retryDelay: cfg.RetryDelay,
	}
}

func (c *Client) CurrentBuild(ctx context.Context, table, locale string) (string, error) {
	endpoint := c.csvURL(table, "", locale)
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("create Wago build request: %w", err)
	}
	resp, err := c.do(req)
	if err != nil {
		return "", fmt.Errorf("request Wago build: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Wago build request returned %s", resp.Status)
	}
	_, params, err := mime.ParseMediaType(resp.Header.Get("Content-Disposition"))
	if err != nil {
		return "", fmt.Errorf("parse Wago content disposition: %w", err)
	}
	filename := params["filename"]
	parts := strings.Split(filepath.Base(filename), ".")
	if len(parts) < 6 {
		return "", fmt.Errorf("unexpected Wago filename %q", filename)
	}
	build := strings.Join(parts[len(parts)-5:len(parts)-1], ".")
	if !buildPattern.MatchString(build) {
		return "", fmt.Errorf("invalid Wago build %q", build)
	}
	return build, nil
}

// CurrentBuildForProduct resolves the newest build that Wago publishes for a
// product key (for example wow_classic or wow_classic_era). The CSV endpoint
// itself does not accept a product selector, so using its unpinned HEAD URL
// for Classic would silently select Retail. The manifest is small and
// build-pinned versions are validated before being returned.
func (c *Client) CurrentBuildForProduct(ctx context.Context, product string) (string, error) {
	product = strings.TrimSpace(strings.ToLower(product))
	if product == "" {
		return "", errors.New("Wago product is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/builds", nil)
	if err != nil {
		return "", fmt.Errorf("create Wago build manifest request: %w", err)
	}
	resp, err := c.do(req)
	if err != nil {
		return "", fmt.Errorf("request Wago build manifest: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		return "", fmt.Errorf("Wago build manifest returned %s", resp.Status)
	}
	var manifest map[string][]buildManifestEntry
	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxBuildManifestBytes))
	if err := decoder.Decode(&manifest); err != nil {
		return "", fmt.Errorf("decode Wago build manifest: %w", err)
	}
	entries, ok := manifest[product]
	if !ok || len(entries) == 0 {
		return "", fmt.Errorf("Wago has no builds for product %q", product)
	}
	var newest string
	for _, entry := range entries {
		version := strings.TrimSpace(entry.Version)
		if !buildPattern.MatchString(version) {
			continue
		}
		if newest == "" || compareBuildVersions(version, newest) > 0 {
			newest = version
		}
	}
	if newest == "" {
		return "", fmt.Errorf("Wago has no valid builds for product %q", product)
	}
	return newest, nil
}

func compareBuildVersions(left, right string) int {
	leftParts := strings.Split(left, ".")
	rightParts := strings.Split(right, ".")
	for index := 0; index < len(leftParts) && index < len(rightParts); index++ {
		leftValue, _ := strconv.Atoi(leftParts[index])
		rightValue, _ := strconv.Atoi(rightParts[index])
		if leftValue < rightValue {
			return -1
		}
		if leftValue > rightValue {
			return 1
		}
	}
	return len(leftParts) - len(rightParts)
}

func (c *Client) Rows(
	ctx context.Context,
	table, build, locale string,
	limit int,
	consume func(map[string]string) error,
) (int, error) {
	count, _, err := c.RowsWithProof(ctx, table, build, locale, limit, consume)
	return count, err
}

func (c *Client) RowsWithProof(
	ctx context.Context,
	table, build, locale string,
	limit int,
	consume func(map[string]string) error,
) (int, ContentProof, error) {
	if !buildPattern.MatchString(build) {
		return 0, ContentProof{}, fmt.Errorf("invalid Wago build %q", build)
	}
	endpoint := c.csvURL(table, build, locale)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, ContentProof{}, fmt.Errorf("create Wago CSV request: %w", err)
	}
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := c.do(req)
	if err != nil {
		return 0, ContentProof{}, fmt.Errorf("request Wago CSV: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		if resp.StatusCode == http.StatusNotFound {
			return 0, ContentProof{}, &UnavailableError{
				Table: table, Build: build, Locale: locale, StatusCode: resp.StatusCode,
			}
		}
		return 0, ContentProof{}, fmt.Errorf("Wago CSV returned %s", resp.Status)
	}

	hasher := sha256.New()
	counter := byteCounter(0)
	reader := csv.NewReader(io.TeeReader(resp.Body, io.MultiWriter(hasher, &counter)))
	reader.ReuseRecord = true
	reader.FieldsPerRecord = -1
	headers, err := reader.Read()
	if err != nil {
		return 0, ContentProof{}, fmt.Errorf("read Wago CSV headers: %w", err)
	}
	headers = append([]string(nil), headers...)
	count := 0
	complete := false
	for limit == 0 || count < limit {
		values, err := reader.Read()
		if errors.Is(err, io.EOF) {
			complete = true
			break
		}
		if err != nil {
			return count, ContentProof{}, fmt.Errorf("read Wago CSV row %d: %w", count+1, err)
		}
		row := make(map[string]string, len(headers))
		for index, header := range headers {
			if index < len(values) {
				row[header] = values[index]
			}
		}
		if err := consume(row); err != nil {
			return count, ContentProof{}, err
		}
		count++
	}
	proof := ContentProof{ByteSize: int64(counter), ETag: resp.Header.Get("ETag"), Complete: complete}
	if complete {
		proof.SHA256 = hasher.Sum(nil)
	}
	return count, proof, nil
}

func (c *Client) do(req *http.Request) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		resp, err := c.httpClient.Do(req.Clone(req.Context()))
		if err == nil && !retryableStatus(resp.StatusCode) {
			return resp, nil
		}
		if attempt >= c.retryMax || req.Context().Err() != nil {
			return resp, err
		}
		if resp != nil {
			_, _ = io.CopyN(io.Discard, resp.Body, 4096)
			_ = resp.Body.Close()
		}
		delay := c.retryDelay * time.Duration(1<<attempt)
		timer := time.NewTimer(delay)
		select {
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		case <-timer.C:
		}
	}
}

func retryableStatus(statusCode int) bool {
	switch statusCode {
	case http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func (c *Client) CSVURL(table, build, locale string) string {
	return c.csvURL(table, build, locale)
}

func (c *Client) csvURL(table, build, locale string) string {
	query := url.Values{"locale": {locale}}
	if build != "" {
		query.Set("build", build)
	}
	return c.baseURL + "/db2/" + url.PathEscape(table) + "/csv?" + query.Encode()
}
