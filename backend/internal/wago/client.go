package wago

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var buildPattern = regexp.MustCompile(`^\d+\.\d+\.\d+\.\d+$`)

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
		cfg.HTTPClient = &http.Client{
			Timeout: 10 * time.Minute,
			Transport: &http.Transport{
				MaxIdleConns:        10,
				MaxIdleConnsPerHost: 4,
				IdleConnTimeout:     90 * time.Second,
			},
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
