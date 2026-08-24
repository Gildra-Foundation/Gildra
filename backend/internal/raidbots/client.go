package raidbots

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	environmentPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]*$`)
	filePattern        = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*\.json$`)
)

type Metadata struct {
	Environment string    `json:"environment"`
	WoWBuild    string    `json:"wowBuild"`
	ContentHash string    `json:"contentHash"`
	GeneratedAt time.Time `json:"generatedAt"`
	Files       []string  `json:"files"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type Config struct {
	BaseURL    string
	HTTPClient *http.Client
}

func New(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://www.raidbots.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{
			Timeout: 15 * time.Minute,
			Transport: &http.Transport{
				MaxIdleConns:        8,
				MaxIdleConnsPerHost: 4,
				IdleConnTimeout:     90 * time.Second,
			},
		}
	}
	return &Client{baseURL: strings.TrimRight(cfg.BaseURL, "/"), httpClient: cfg.HTTPClient}
}

func (c *Client) Metadata(ctx context.Context, environment string) (Metadata, error) {
	var metadata Metadata
	body, _, err := c.open(ctx, environment, "metadata.json")
	if err != nil {
		return metadata, err
	}
	defer body.Close()
	if err := json.NewDecoder(body).Decode(&metadata); err != nil {
		return metadata, fmt.Errorf("decode Raidbots metadata: %w", err)
	}
	if metadata.WoWBuild == "" || metadata.ContentHash == "" {
		return metadata, errors.New("Raidbots metadata is missing build or content hash")
	}
	return metadata, nil
}

func (c *Client) Array(
	ctx context.Context,
	environment, file string,
	limit int,
	consume func(json.RawMessage) error,
) (int, error) {
	body, _, err := c.open(ctx, environment, file)
	if err != nil {
		return 0, err
	}
	defer body.Close()

	decoder := json.NewDecoder(body)
	token, err := decoder.Token()
	if err != nil {
		return 0, fmt.Errorf("read Raidbots %s: %w", file, err)
	}
	if delimiter, ok := token.(json.Delim); !ok || delimiter != '[' {
		return 0, fmt.Errorf("Raidbots %s is not a JSON array", file)
	}
	count := 0
	for decoder.More() && (limit == 0 || count < limit) {
		var record json.RawMessage
		if err := decoder.Decode(&record); err != nil {
			return count, fmt.Errorf("decode Raidbots %s record %d: %w", file, count+1, err)
		}
		if err := consume(record); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

// Records streams either a top-level JSON array or object without loading the
// complete Raidbots artifact into memory. Object property names are preserved
// as stable record keys; array records use their zero-based position.
func (c *Client) Records(
	ctx context.Context,
	environment, file string,
	limit int,
	consume func(string, json.RawMessage) error,
) (int, error) {
	body, _, err := c.open(ctx, environment, file)
	if err != nil {
		return 0, err
	}
	defer body.Close()
	decoder := json.NewDecoder(body)
	token, err := decoder.Token()
	if err != nil {
		return 0, fmt.Errorf("read Raidbots %s: %w", file, err)
	}
	delimiter, ok := token.(json.Delim)
	if !ok || (delimiter != '[' && delimiter != '{') {
		return 0, fmt.Errorf("Raidbots %s is not a JSON array or object", file)
	}
	count := 0
	for decoder.More() && (limit == 0 || count < limit) {
		key := strconv.Itoa(count)
		if delimiter == '{' {
			property, err := decoder.Token()
			if err != nil {
				return count, fmt.Errorf("read Raidbots %s property: %w", file, err)
			}
			key, ok = property.(string)
			if !ok {
				return count, fmt.Errorf("Raidbots %s contains a non-string object key", file)
			}
		}
		var record json.RawMessage
		if err := decoder.Decode(&record); err != nil {
			return count, fmt.Errorf("decode Raidbots %s record %d: %w", file, count+1, err)
		}
		if err := consume(key, record); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func (c *Client) ItemNames(
	ctx context.Context,
	environment string,
	itemIDs map[int64]struct{},
	consume func(int64, map[string]string) error,
) (int, error) {
	if len(itemIDs) == 0 {
		return 0, nil
	}
	body, _, err := c.open(ctx, environment, "item-names.json")
	if err != nil {
		return 0, err
	}
	defer body.Close()

	decoder := json.NewDecoder(body)
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		return 0, errors.New("Raidbots item-names.json is not a JSON object")
	}
	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			return 0, fmt.Errorf("read Raidbots item names section: %w", err)
		}
		if key != "ItemSparse" {
			var discard json.RawMessage
			if err := decoder.Decode(&discard); err != nil {
				return 0, fmt.Errorf("skip Raidbots item names section: %w", err)
			}
			continue
		}
		return decodeItemNames(decoder, itemIDs, consume)
	}
	return 0, errors.New("Raidbots item-names.json has no ItemSparse section")
}

func decodeItemNames(decoder *json.Decoder, itemIDs map[int64]struct{}, consume func(int64, map[string]string) error) (int, error) {
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		return 0, errors.New("Raidbots ItemSparse names is not a JSON object")
	}
	count := 0
	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			return count, fmt.Errorf("read Raidbots item id: %w", err)
		}
		itemID, err := strconv.ParseInt(key.(string), 10, 64)
		if err != nil {
			return count, fmt.Errorf("parse Raidbots item id %q: %w", key, err)
		}
		var names map[string]string
		if err := decoder.Decode(&names); err != nil {
			return count, fmt.Errorf("decode Raidbots item %d names: %w", itemID, err)
		}
		if _, wanted := itemIDs[itemID]; !wanted {
			continue
		}
		if err := consume(itemID, names); err != nil {
			return count, err
		}
		count++
		if count == len(itemIDs) {
			return count, nil
		}
	}
	return count, nil
}

func (c *Client) URL(environment, file string) string {
	return c.baseURL + "/static/data/" + environment + "/" + file
}

func (c *Client) open(ctx context.Context, environment, file string) (io.ReadCloser, string, error) {
	if !environmentPattern.MatchString(environment) {
		return nil, "", fmt.Errorf("invalid Raidbots environment %q", environment)
	}
	if !filePattern.MatchString(file) {
		return nil, "", fmt.Errorf("invalid Raidbots file %q", file)
	}
	endpoint := c.URL(environment, file)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, endpoint, fmt.Errorf("create Raidbots request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, endpoint, fmt.Errorf("request Raidbots %s: %w", file, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		return nil, endpoint, fmt.Errorf("Raidbots %s returned %s", file, resp.Status)
	}
	return resp.Body, endpoint, nil
}
