package battlenet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const defaultTokenURL = "https://oauth.battle.net/token"

const (
	requestAttempts = 12
	maxRetryDelay   = 60 * time.Second
)

var staticNamespacePattern = regexp.MustCompile(`^static-([0-9]+(?:\.[0-9]+)*)_([0-9]+)(?:-([a-z0-9]+))?-([a-z]{2})$`)

type Client struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client
	tokenURL     string
	apiBaseURL   func(string) string

	mu          sync.Mutex
	accessToken string
	tokenExpiry time.Time
}

type Config struct {
	ClientID     string
	ClientSecret string
	HTTPClient   *http.Client
	TokenURL     string
	APIBaseURL   func(region string) string
}

type SearchPage struct {
	Page      int            `json:"page"`
	PageCount int            `json:"pageCount"`
	Results   []SearchResult `json:"results"`
}

type SearchResult struct {
	Key  ResourceKey     `json:"key"`
	Data json.RawMessage `json:"data"`
}

type ResourceKey struct {
	Href string `json:"href"`
}

type RemoteError struct {
	StatusCode int
	Status     string
	Body       string
	RetryAfter time.Duration
}

// OAuthError deliberately excludes the response body. OAuth providers can
// include request-derived values in error descriptions, so importer logs must
// only contain the HTTP status and a tightly validated machine error code.
type OAuthError struct {
	StatusCode int
	Status     string
	Code       string
}

func (e *OAuthError) Error() string {
	if e.Code == "" {
		return fmt.Sprintf("Battle.net OAuth returned %s", e.Status)
	}
	return fmt.Sprintf("Battle.net OAuth returned %s (%s)", e.Status, e.Code)
}

func (e *RemoteError) Error() string {
	return fmt.Sprintf("Battle.net returned %s: %s", e.Status, e.Body)
}

func IsNotFound(err error) bool {
	var remote *RemoteError
	return errors.As(err, &remote) && remote.StatusCode == http.StatusNotFound
}

func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.ClientID) == "" || strings.TrimSpace(cfg.ClientSecret) == "" {
		return nil, errors.New("Battle.net client ID and secret are required")
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 60 * time.Second}
	}
	if cfg.TokenURL == "" {
		cfg.TokenURL = defaultTokenURL
	}
	if cfg.APIBaseURL == nil {
		cfg.APIBaseURL = func(region string) string {
			return "https://" + region + ".api.blizzard.com"
		}
	}
	return &Client{
		clientID: cfg.ClientID, clientSecret: cfg.ClientSecret,
		httpClient: cfg.HTTPClient, tokenURL: cfg.TokenURL, apiBaseURL: cfg.APIBaseURL,
	}, nil
}

func (c *Client) Search(ctx context.Context, region, namespace, locale, entityType string, page, pageSize int) (SearchPage, error) {
	if entityType != "item" && entityType != "spell" && entityType != "creature" {
		return SearchPage{}, fmt.Errorf("unsupported entity type %q", entityType)
	}
	endpoint, err := c.SearchURL(region, namespace, locale, entityType, page, pageSize)
	if err != nil {
		return SearchPage{}, err
	}
	var result SearchPage
	if err := c.getJSON(ctx, endpoint, &result); err != nil {
		return SearchPage{}, err
	}
	return result, nil
}

func (c *Client) SearchRange(ctx context.Context, region, namespace, locale, entityType string, page, pageSize int, minID, maxID int64) (SearchPage, error) {
	if entityType != "item" && entityType != "spell" && entityType != "creature" {
		return SearchPage{}, fmt.Errorf("unsupported entity type %q", entityType)
	}
	endpoint, err := c.SearchRangeURL(region, namespace, locale, entityType, page, pageSize, minID, maxID)
	if err != nil {
		return SearchPage{}, err
	}
	var result SearchPage
	if err := c.getJSON(ctx, endpoint, &result); err != nil {
		return SearchPage{}, err
	}
	return result, nil
}

// MaxExternalID returns the highest ID exposed by the official search index.
// Blizzard caps search pagination, so importers must not infer the upper bound
// by walking pages. Sorting a single result by id:desc gives a stable bound
// that can then be consumed through small, inclusive ID ranges.
func (c *Client) MaxExternalID(ctx context.Context, region, namespace, locale, entityType string) (int64, error) {
	endpoint, err := c.SearchURL(region, namespace, locale, entityType, 1, 1)
	if err != nil {
		return 0, err
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return 0, err
	}
	query := parsed.Query()
	query.Set("orderby", "id:desc")
	parsed.RawQuery = query.Encode()

	var page SearchPage
	if err := c.getJSON(ctx, parsed.String(), &page); err != nil {
		return 0, err
	}
	if len(page.Results) == 0 {
		return 0, nil
	}
	var document struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(page.Results[0].Data, &document); err != nil {
		return 0, fmt.Errorf("decode highest %s ID: %w", entityType, err)
	}
	if document.ID <= 0 {
		return 0, fmt.Errorf("official %s search returned invalid highest ID %d", entityType, document.ID)
	}
	return document.ID, nil
}

func (c *Client) SearchURL(region, namespace, locale, entityType string, page, pageSize int) (string, error) {
	if entityType != "item" && entityType != "spell" && entityType != "creature" {
		return "", fmt.Errorf("unsupported entity type %q", entityType)
	}
	query := url.Values{
		"namespace": {namespace}, "locale": {locale},
		"_page": {strconv.Itoa(page)}, "_pageSize": {strconv.Itoa(pageSize)},
		"orderby": {"id"},
	}
	return c.apiBaseURL(region) + "/data/wow/search/" + entityType + "?" + query.Encode(), nil
}

func (c *Client) SearchRangeURL(region, namespace, locale, entityType string, page, pageSize int, minID, maxID int64) (string, error) {
	endpoint, err := c.SearchURL(region, namespace, locale, entityType, page, pageSize)
	if err != nil {
		return "", err
	}
	if minID <= 0 || maxID < minID {
		return "", fmt.Errorf("invalid Battle.net %s ID range [%d,%d]", entityType, minID, maxID)
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("id", fmt.Sprintf("[%d,%d]", minID, maxID))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func (c *Client) Index(ctx context.Context, region, namespace, locale, resource string) (json.RawMessage, string, error) {
	endpoint, err := c.IndexURL(region, namespace, locale, resource)
	if err != nil {
		return nil, "", err
	}
	var payload json.RawMessage
	if err := c.getJSON(ctx, endpoint, &payload); err != nil {
		return nil, endpoint, err
	}
	return payload, endpoint, nil
}

func (c *Client) IndexURL(region, namespace, locale, resource string) (string, error) {
	if !validResource(resource) {
		return "", fmt.Errorf("invalid Battle.net resource %q", resource)
	}
	query := url.Values{"namespace": {namespace}, "locale": {locale}}
	return c.apiBaseURL(region) + "/data/wow/" + resource + "/index?" + query.Encode(), nil
}

// FetchLink follows a Battle.net resource key while keeping the OAuth token
// scoped to the configured regional API origin. Resource keys carry a
// build-pinned namespace; reconstructing detail URLs with the moving
// "static-{region}" alias can otherwise return 403 or mix builds.
func (c *Client) FetchLink(ctx context.Context, region, locale, href string) (json.RawMessage, string, error) {
	linkedURL, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return nil, "", fmt.Errorf("parse Battle.net resource link: %w", err)
	}
	baseURL, err := url.Parse(c.apiBaseURL(region))
	if err != nil {
		return nil, "", fmt.Errorf("parse Battle.net API base URL: %w", err)
	}
	if linkedURL.Scheme != baseURL.Scheme || !strings.EqualFold(linkedURL.Host, baseURL.Host) {
		return nil, "", fmt.Errorf("Battle.net resource link origin %q does not match %q", linkedURL.Host, baseURL.Host)
	}
	query := linkedURL.Query()
	query.Set("locale", locale)
	linkedURL.RawQuery = query.Encode()
	endpoint := linkedURL.String()
	var payload json.RawMessage
	if err := c.getJSON(ctx, endpoint, &payload); err != nil {
		return nil, endpoint, err
	}
	return payload, endpoint, nil
}

// CurrentBuild resolves the build actually published through Battle.net's
// static namespace alias. The public API can lag behind the newest game client,
// so callers must record this value instead of assuming the client build.
func (c *Client) CurrentBuild(ctx context.Context, region, locale string) (int, string, error) {
	return c.CurrentBuildForNamespace(ctx, region, locale, "static-"+region)
}

func (c *Client) CurrentBuildForNamespace(ctx context.Context, region, locale, namespace string) (int, string, error) {
	if strings.TrimSpace(namespace) == "" {
		return 0, "", errors.New("Battle.net discovery namespace is required")
	}
	page, err := c.Search(ctx, region, namespace, locale, "item", 1, 1)
	if err != nil {
		return 0, "", fmt.Errorf("resolve current Battle.net build: %w", err)
	}
	if len(page.Results) == 0 || strings.TrimSpace(page.Results[0].Key.Href) == "" {
		return 0, "", errors.New("Battle.net item search did not include a build-pinned resource key")
	}
	return buildFromResourceLink(page.Results[0].Key.Href)
}

func buildFromResourceLink(href string) (int, string, error) {
	parsed, err := url.Parse(href)
	if err != nil {
		return 0, "", fmt.Errorf("parse Battle.net build link: %w", err)
	}
	namespace := parsed.Query().Get("namespace")
	match := staticNamespacePattern.FindStringSubmatch(namespace)
	if match == nil {
		return 0, "", fmt.Errorf("invalid Battle.net static namespace %q", namespace)
	}
	build, err := strconv.Atoi(match[2])
	if err != nil || build <= 0 {
		return 0, "", fmt.Errorf("invalid Battle.net build in namespace %q", namespace)
	}
	return build, match[1] + "." + strconv.Itoa(build), nil
}

func (c *Client) Detail(ctx context.Context, region, namespace, locale, entityType string, id int64) (json.RawMessage, string, error) {
	if !validResource(entityType) {
		return nil, "", fmt.Errorf("invalid Battle.net resource %q", entityType)
	}
	query := url.Values{"namespace": {namespace}, "locale": {locale}}
	endpoint := fmt.Sprintf("%s/data/wow/%s/%d?%s", c.apiBaseURL(region), entityType, id, query.Encode())
	var payload json.RawMessage
	if err := c.getJSON(ctx, endpoint, &payload); err != nil {
		return nil, endpoint, err
	}
	return payload, endpoint, nil
}

func (c *Client) getJSON(ctx context.Context, endpoint string, target any) error {
	for attempt := range requestAttempts {
		err := c.getJSONOnce(ctx, endpoint, target)
		if err == nil {
			return nil
		}
		var remote *RemoteError
		if !errors.As(err, &remote) {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if !retryableRequestError(err) || attempt == requestAttempts-1 {
				return err
			}
			delay := min(time.Duration(1<<attempt)*time.Second, maxRetryDelay)
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
			continue
		}
		if remote.StatusCode == http.StatusUnauthorized && attempt == 0 {
			c.invalidateToken()
			continue
		}
		if remote.StatusCode != http.StatusTooManyRequests && remote.StatusCode < http.StatusInternalServerError {
			return err
		}
		if attempt == requestAttempts-1 {
			return err
		}
		delay := remote.RetryAfter
		if delay <= 0 {
			delay = time.Duration(1<<attempt) * time.Second
		}
		if delay > maxRetryDelay {
			delay = maxRetryDelay
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return errors.New("Battle.net request retry loop exhausted")
}

func retryableRequestError(err error) bool {
	var networkError net.Error
	return errors.As(err, &networkError) && (networkError.Timeout() || networkError.Temporary())
}

func (c *Client) getJSONOnce(ctx context.Context, endpoint string, target any) error {
	token, err := c.token(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create Battle.net request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request Battle.net: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		retryAfter := time.Duration(0)
		if seconds, parseErr := strconv.Atoi(resp.Header.Get("Retry-After")); parseErr == nil && seconds > 0 {
			retryAfter = time.Duration(seconds) * time.Second
		}
		return &RemoteError{StatusCode: resp.StatusCode, Status: resp.Status, Body: strings.TrimSpace(string(body)), RetryAfter: retryAfter}
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode Battle.net response: %w", err)
	}
	return nil
}

func validResource(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if (char < 'a' || char > 'z') && char != '-' {
			return false
		}
	}
	return true
}

func (c *Client) token(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.accessToken != "" && time.Now().Add(time.Minute).Before(c.tokenExpiry) {
		return c.accessToken, nil
	}
	body := []byte("grant_type=client_credentials")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create OAuth request: %w", err)
	}
	req.SetBasicAuth(c.clientID, c.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request OAuth token: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", &OAuthError{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Code:       safeOAuthErrorCode(body),
		}
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode OAuth response: %w", err)
	}
	if result.AccessToken == "" {
		return "", errors.New("OAuth response did not contain an access token")
	}
	if result.ExpiresIn <= 0 {
		result.ExpiresIn = int64((24 * time.Hour) / time.Second)
	}
	c.accessToken = result.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	return c.accessToken, nil
}

func safeOAuthErrorCode(body []byte) string {
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	code := strings.TrimSpace(payload.Error)
	if code == "" || len(code) > 64 {
		return ""
	}
	for _, char := range code {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') &&
			(char < '0' || char > '9') && char != '_' && char != '-' && char != '.' {
			return ""
		}
	}
	return code
}

func (c *Client) invalidateToken() {
	c.mu.Lock()
	c.accessToken = ""
	c.tokenExpiry = time.Time{}
	c.mu.Unlock()
}
