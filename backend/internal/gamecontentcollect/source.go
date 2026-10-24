package gamecontentcollect

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type CachedArtifact struct {
	ID           string
	Body         []byte
	ETag         string
	LastModified string
}
type FetchResult struct {
	Body         []byte
	Status       int
	ETag         string
	LastModified string
}
type Source interface {
	Fetch(context.Context, Target, *CachedArtifact) (FetchResult, error)
}

type HTTPSource struct {
	client      *http.Client
	mu          sync.Mutex
	lastRequest time.Time
}

func NewHTTPSource() *HTTPSource {
	return &HTTPSource{client: &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (s *HTTPSource) Fetch(ctx context.Context, t Target, previous *CachedArtifact) (FetchResult, error) {
	if err := t.Validate(); err != nil {
		return FetchResult{}, err
	}
	// Daily jobs share a one-request-per-second provider budget. One fetch per
	// module and bounded River attempts prevent fan-out on upstream failure.
	s.mu.Lock()
	delay := time.Until(s.lastRequest.Add(time.Second))
	if delay > 0 {
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			s.mu.Unlock()
			return FetchResult{}, ctx.Err()
		case <-timer.C:
		}
	}
	s.lastRequest = time.Now()
	s.mu.Unlock()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL(t), nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Gildra-DataHub/0.2 (+https://gildra.net; collect-only)")
	if previous != nil {
		if previous.ETag != "" {
			req.Header.Set("If-None-Match", previous.ETag)
		} else if previous.LastModified != "" {
			req.Header.Set("If-Modified-Since", previous.LastModified)
		}
	}
	res, err := s.client.Do(req)
	if err != nil {
		return FetchResult{}, &Failure{Code: "source_transport", Retryable: true}
	}
	defer res.Body.Close()
	result := FetchResult{Status: res.StatusCode, ETag: res.Header.Get("ETag"), LastModified: res.Header.Get("Last-Modified")}
	if len(result.ETag) > 1024 || len(result.LastModified) > 128 {
		return FetchResult{}, &Failure{Code: "invalid_source_headers"}
	}
	if res.StatusCode == http.StatusNotModified {
		if previous == nil || len(previous.Body) == 0 {
			return FetchResult{}, &Failure{Code: "unusable_304"}
		}
		result.Body = previous.Body
		if result.ETag == "" {
			result.ETag = previous.ETag
		}
		if result.LastModified == "" {
			result.LastModified = previous.LastModified
		}
		return result, nil
	}
	if res.StatusCode != http.StatusOK {
		retry := res.StatusCode == 429 || res.StatusCode >= 500
		delay := time.Duration(0)
		if res.StatusCode == 429 || res.StatusCode == 503 {
			delay = retryAfter(res.Header.Get("Retry-After"), time.Now())
		}
		return FetchResult{}, &Failure{Code: "source_http_" + strconv.Itoa(res.StatusCode), Retryable: retry, RetryAfter: delay}
	}
	kind, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if kind != "application/json" {
		return FetchResult{}, &Failure{Code: "source_not_json"}
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
	if err != nil {
		return FetchResult{}, &Failure{Code: "source_read", Retryable: true}
	}
	if len(raw) > 1<<20 || len(raw) < 2 || !json.Valid(raw) || !strings.HasPrefix(strings.TrimSpace(string(raw)), "{") {
		return FetchResult{}, &Failure{Code: "invalid_source_json"}
	}
	result.Body = raw
	return result, nil
}

func retryAfter(value string, now time.Time) time.Duration {
	if seconds, err := strconv.ParseInt(value, 10, 32); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if date, err := http.ParseTime(value); err == nil && date.After(now) {
		return date.Sub(now)
	}
	return time.Minute
}
