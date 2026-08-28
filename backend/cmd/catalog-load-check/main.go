package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/httpapi"
)

const maxResponseBytes = 8 << 20

type options struct {
	baseURL             string
	databaseURL         string
	inProcess           bool
	product             string
	locale              string
	dataset             string
	requests            int
	concurrency         int
	requestTimeout      time.Duration
	datasetP95Threshold time.Duration
	summaryP95Threshold time.Duration
	detailP95Threshold  time.Duration
}

type endpoint struct {
	name      string
	path      string
	threshold time.Duration
}

type result struct {
	GeneratedAt  time.Time        `json:"generatedAt"`
	BaseURL      string           `json:"baseUrl"`
	Product      string           `json:"product"`
	Locale       string           `json:"locale"`
	Dataset      string           `json:"dataset"`
	Requests     int              `json:"requestsPerEndpoint"`
	Concurrency  int              `json:"concurrency"`
	RequestLimit string           `json:"requestTimeout"`
	Passed       bool             `json:"passed"`
	Endpoints    []endpointResult `json:"endpoints"`
}

type endpointResult struct {
	Name           string         `json:"name"`
	Path           string         `json:"path"`
	Requests       int            `json:"requests"`
	Succeeded      int            `json:"succeeded"`
	Failed         int            `json:"failed"`
	StatusCodes    map[int]int    `json:"statusCodes"`
	P50            time.Duration  `json:"-"`
	P95            time.Duration  `json:"-"`
	P99            time.Duration  `json:"-"`
	Maximum        time.Duration  `json:"-"`
	Threshold      time.Duration  `json:"-"`
	P50MS          float64        `json:"p50Ms"`
	P95MS          float64        `json:"p95Ms"`
	P99MS          float64        `json:"p99Ms"`
	MaximumMS      float64        `json:"maximumMs"`
	P95ThresholdMS float64        `json:"p95ThresholdMs"`
	Passed         bool           `json:"passed"`
	Errors         map[string]int `json:"errors,omitempty"`
}

type observation struct {
	duration time.Duration
	status   int
	err      error
}

func main() {
	if err := run(); err != nil {
		slog.Error("catalog load check failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	opts, err := parseOptions()
	if err != nil {
		return err
	}
	ctx := context.Background()
	if opts.inProcess {
		server, closeServer, err := startInProcessServer(ctx, opts.databaseURL)
		if err != nil {
			return err
		}
		defer closeServer()
		opts.baseURL = server.URL
	}
	client := &http.Client{
		Timeout: opts.requestTimeout,
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			MaxIdleConns:          opts.concurrency * 4,
			MaxIdleConnsPerHost:   opts.concurrency * 2,
			IdleConnTimeout:       30 * time.Second,
			ResponseHeaderTimeout: opts.requestTimeout,
		},
	}
	detailID, err := discoverDetailID(ctx, client, opts)
	if err != nil {
		return err
	}
	endpoints := []endpoint{
		{name: "library_datasets", path: datasetsPath(opts), threshold: opts.datasetP95Threshold},
		{name: "entity_summaries", path: summariesPath(opts), threshold: opts.summaryP95Threshold},
		{name: "entity_detail", path: detailPath(opts, detailID), threshold: opts.detailP95Threshold},
	}
	report := result{
		GeneratedAt: time.Now().UTC(), BaseURL: opts.baseURL, Product: opts.product,
		Locale: opts.locale, Dataset: opts.dataset, Requests: opts.requests,
		Concurrency: opts.concurrency, RequestLimit: opts.requestTimeout.String(), Passed: true,
	}
	for _, target := range endpoints {
		measured := measureEndpoint(ctx, client, opts, target)
		report.Endpoints = append(report.Endpoints, measured)
		report.Passed = report.Passed && measured.Passed
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return fmt.Errorf("encode load report: %w", err)
	}
	if !report.Passed {
		return errors.New("one or more catalog latency/error gates failed")
	}
	return nil
}

func parseOptions() (options, error) {
	opts := options{}
	flag.StringVar(&opts.baseURL, "base-url", "", "catalog API HTTPS origin (HTTP allowed only for loopback)")
	flag.BoolVar(&opts.inProcess, "in-process", false, "serve the public catalog in-process from DATABASE_URL (read-only journey)")
	flag.StringVar(&opts.product, "product", "wow", "catalog product slug")
	flag.StringVar(&opts.locale, "locale", "en_US", "catalog locale")
	flag.StringVar(&opts.dataset, "dataset", "items", "public dataset slug")
	flag.IntVar(&opts.requests, "requests", 60, "measured requests per endpoint")
	flag.IntVar(&opts.concurrency, "concurrency", 4, "concurrent requests (maximum 32)")
	flag.DurationVar(&opts.requestTimeout, "timeout", 10*time.Second, "per-request timeout")
	flag.DurationVar(&opts.datasetP95Threshold, "datasets-p95", time.Second, "dataset-list p95 gate")
	flag.DurationVar(&opts.summaryP95Threshold, "summaries-p95", 500*time.Millisecond, "summary p95 gate")
	flag.DurationVar(&opts.detailP95Threshold, "detail-p95", time.Second, "detail p95 gate")
	flag.Parse()
	if opts.inProcess {
		opts.databaseURL = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	return normalizeOptions(opts)
}

func normalizeOptions(opts options) (options, error) {
	if opts.inProcess {
		if strings.TrimSpace(opts.baseURL) != "" {
			return options{}, errors.New("base-url and in-process are mutually exclusive")
		}
		if opts.databaseURL == "" {
			return options{}, errors.New("DATABASE_URL is required with in-process")
		}
		opts.baseURL = "http://127.0.0.1"
	}
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(opts.baseURL), "/"))
	if err != nil || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != "" {
		return options{}, errors.New("base-url must be an HTTP(S) origin without credentials, path, query, or fragment")
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLoopbackHost(parsed.Hostname())) {
		return options{}, errors.New("base-url must use HTTPS; HTTP is allowed only for loopback")
	}
	if opts.requests < 1 || opts.requests > 2_000 {
		return options{}, errors.New("requests must be between 1 and 2000")
	}
	if opts.concurrency < 1 || opts.concurrency > 32 || opts.concurrency > opts.requests {
		return options{}, errors.New("concurrency must be between 1 and 32 and cannot exceed requests")
	}
	if opts.requestTimeout < 100*time.Millisecond || opts.requestTimeout > time.Minute {
		return options{}, errors.New("timeout must be between 100ms and 1m")
	}
	for label, value := range map[string]time.Duration{
		"datasets-p95":  opts.datasetP95Threshold,
		"summaries-p95": opts.summaryP95Threshold,
		"detail-p95":    opts.detailP95Threshold,
	} {
		if value < time.Millisecond || value > time.Minute {
			return options{}, fmt.Errorf("%s must be between 1ms and 1m", label)
		}
	}
	if !validSlug(opts.product) || !validSlug(opts.dataset) {
		return options{}, errors.New("product and dataset must be lowercase slugs")
	}
	if opts.locale != "en_US" && opts.locale != "ru_RU" {
		return options{}, errors.New("locale must be en_US or ru_RU")
	}
	opts.baseURL = parsed.String()
	return opts, nil
}

func startInProcessServer(ctx context.Context, databaseURL string) (*httptest.Server, func(), error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("open PostgreSQL pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}
	server := httpapi.NewServer(nil, catalog.NewService(pool), nil)
	// Keep the in-process gate conservative: every measurement reaches PostgreSQL
	// instead of being satisfied by the public response cache.
	handler := api.Handler(api.NewStrictHandler(server, nil))
	local := httptest.NewServer(handler)
	closeServer := func() {
		local.Close()
		pool.Close()
	}
	return local, closeServer, nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	address := net.ParseIP(host)
	return address != nil && address.IsLoopback()
}

func validSlug(value string) bool {
	if len(value) < 2 || len(value) > 64 {
		return false
	}
	for index, character := range value {
		if character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || index > 0 && character == '-' || index > 0 && character == '_' {
			continue
		}
		return false
	}
	return true
}

func datasetsPath(opts options) string {
	return "/v1/library/datasets?product=" + url.QueryEscape(opts.product) + "&locale=" + url.QueryEscape(opts.locale)
}

func summariesPath(opts options) string {
	return "/v1/game/entity-summaries?product=" + url.QueryEscape(opts.product) + "&locale=" + url.QueryEscape(opts.locale) +
		"&dataset=" + url.QueryEscape(opts.dataset) + "&limit=20"
}

func detailPath(opts options, id uuid.UUID) string {
	return "/v1/game/entities/" + id.String() + "?locale=" + url.QueryEscape(opts.locale) + "&dataset=" + url.QueryEscape(opts.dataset)
}

func discoverDetailID(ctx context.Context, client *http.Client, opts options) (uuid.UUID, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, opts.baseURL+summariesPath(opts), nil)
	if err != nil {
		return uuid.Nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "gildra-catalog-load-check/1")
	response, err := client.Do(request)
	if err != nil {
		return uuid.Nil, fmt.Errorf("discover detail entity: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return uuid.Nil, fmt.Errorf("discover detail entity: HTTP %d", response.StatusCode)
	}
	limited := io.LimitReader(response.Body, maxResponseBytes+1)
	var payload struct {
		Data []struct {
			ID uuid.UUID `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(limited).Decode(&payload); err != nil {
		return uuid.Nil, fmt.Errorf("decode summary discovery response: %w", err)
	}
	if len(payload.Data) == 0 || payload.Data[0].ID == uuid.Nil {
		return uuid.Nil, errors.New("summary discovery returned no entity")
	}
	return payload.Data[0].ID, nil
}

func measureEndpoint(ctx context.Context, client *http.Client, opts options, target endpoint) endpointResult {
	jobs := make(chan struct{})
	observations := make(chan observation, opts.requests)
	var workers sync.WaitGroup
	for range opts.concurrency {
		workers.Go(func() {
			for range jobs {
				observations <- requestOnce(ctx, client, opts.baseURL+target.path)
			}
		})
	}
	go func() {
		defer close(jobs)
		for range opts.requests {
			jobs <- struct{}{}
		}
	}()
	workers.Wait()
	close(observations)

	durations := make([]time.Duration, 0, opts.requests)
	measured := endpointResult{
		Name: target.name, Path: target.path, Requests: opts.requests,
		StatusCodes: make(map[int]int), Errors: make(map[string]int), Threshold: target.threshold,
	}
	for item := range observations {
		measured.StatusCodes[item.status]++
		if item.err != nil {
			measured.Failed++
			measured.Errors[item.err.Error()]++
			continue
		}
		measured.Succeeded++
		durations = append(durations, item.duration)
	}
	slices.Sort(durations)
	measured.P50 = percentile(durations, 50)
	measured.P95 = percentile(durations, 95)
	measured.P99 = percentile(durations, 99)
	if len(durations) > 0 {
		measured.Maximum = durations[len(durations)-1]
	}
	measured.P50MS = durationMilliseconds(measured.P50)
	measured.P95MS = durationMilliseconds(measured.P95)
	measured.P99MS = durationMilliseconds(measured.P99)
	measured.MaximumMS = durationMilliseconds(measured.Maximum)
	measured.P95ThresholdMS = durationMilliseconds(measured.Threshold)
	measured.Passed = measured.Failed == 0 && measured.Succeeded == opts.requests && measured.P95 <= measured.Threshold
	if len(measured.Errors) == 0 {
		measured.Errors = nil
	}
	return measured
}

func durationMilliseconds(value time.Duration) float64 {
	return float64(value) / float64(time.Millisecond)
}

func requestOnce(ctx context.Context, client *http.Client, targetURL string) observation {
	started := time.Now()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return observation{err: err}
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "gildra-catalog-load-check/1")
	response, err := client.Do(request)
	duration := time.Since(started)
	if err != nil {
		return observation{duration: duration, err: fmt.Errorf("request failed: %w", err)}
	}
	defer response.Body.Close()
	written, readErr := io.Copy(io.Discard, io.LimitReader(response.Body, maxResponseBytes+1))
	if readErr != nil {
		return observation{duration: duration, status: response.StatusCode, err: fmt.Errorf("read body: %w", readErr)}
	}
	if written > maxResponseBytes {
		return observation{duration: duration, status: response.StatusCode, err: errors.New("response exceeds 8 MiB")}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return observation{duration: duration, status: response.StatusCode, err: fmt.Errorf("HTTP %d", response.StatusCode)}
	}
	return observation{duration: duration, status: response.StatusCode}
}

func percentile(sorted []time.Duration, value int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	index := max((len(sorted)*value+99)/100, 1)
	return sorted[index-1]
}
