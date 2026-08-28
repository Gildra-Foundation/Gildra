package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestLoadCheckMeasuresCatalogJourney(t *testing.T) {
	entityID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		switch {
		case request.URL.Path == "/v1/library/datasets":
			fmt.Fprint(response, `{"data":[]}`)
		case request.URL.Path == "/v1/game/entity-summaries":
			fmt.Fprintf(response, `{"data":[{"id":%q}]}`, entityID.String())
		case request.URL.Path == "/v1/game/entities/"+entityID.String():
			fmt.Fprintf(response, `{"id":%q}`, entityID.String())
		default:
			http.NotFound(response, request)
		}
	}))
	t.Cleanup(server.Close)
	opts, err := normalizeOptions(options{
		baseURL: server.URL, product: "wow", locale: "en_US", dataset: "items",
		requests: 8, concurrency: 2, requestTimeout: time.Second,
		datasetP95Threshold: time.Second, summaryP95Threshold: time.Second, detailP95Threshold: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	client := server.Client()
	discovered, err := discoverDetailID(context.Background(), client, opts)
	if err != nil {
		t.Fatal(err)
	}
	if discovered != entityID {
		t.Fatalf("discovered entity=%s, want %s", discovered, entityID)
	}
	measured := measureEndpoint(context.Background(), client, opts, endpoint{
		name: "entity_detail", path: detailPath(opts, entityID), threshold: time.Second,
	})
	if !measured.Passed || measured.Succeeded != opts.requests || measured.Failed != 0 {
		t.Fatalf("unexpected load result: %#v", measured)
	}
}

func TestLoadCheckFailsClosedOnHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		http.Error(response, "blocked", http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	opts, err := normalizeOptions(options{
		baseURL: server.URL, product: "wow", locale: "en_US", dataset: "items",
		requests: 4, concurrency: 2, requestTimeout: time.Second,
		datasetP95Threshold: time.Second, summaryP95Threshold: time.Second, detailP95Threshold: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	measured := measureEndpoint(context.Background(), server.Client(), opts, endpoint{
		name: "blocked", path: "/blocked", threshold: time.Second,
	})
	if measured.Passed || measured.Failed != 4 || measured.StatusCodes[http.StatusServiceUnavailable] != 4 {
		t.Fatalf("HTTP failures were not preserved: %#v", measured)
	}
}

func TestNormalizeOptionsRejectsUnsafeTargets(t *testing.T) {
	tests := []string{
		"http://example.com",
		"https://user:secret@example.com",
		"https://example.com/path",
		"file:///tmp/catalog",
	}
	for _, target := range tests {
		t.Run(target, func(t *testing.T) {
			_, err := normalizeOptions(options{
				baseURL: target, product: "wow", locale: "en_US", dataset: "items",
				requests: 1, concurrency: 1, requestTimeout: time.Second,
				datasetP95Threshold: time.Second, summaryP95Threshold: time.Second, detailP95Threshold: time.Second,
			})
			if err == nil {
				t.Fatal("unsafe target was accepted")
			}
		})
	}
}

func TestNormalizeOptionsAllowsInProcessOnlyWithDatabaseURL(t *testing.T) {
	opts, err := normalizeOptions(options{
		inProcess: true, databaseURL: "postgres://catalog@example.invalid/catalog",
		product: "wow", locale: "en_US", dataset: "items",
		requests: 4, concurrency: 2, requestTimeout: time.Second,
		datasetP95Threshold: time.Second, summaryP95Threshold: time.Second, detailP95Threshold: time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if opts.baseURL != "http://127.0.0.1" {
		t.Fatalf("base URL=%q, want loopback placeholder", opts.baseURL)
	}

	_, err = normalizeOptions(options{
		inProcess: true,
		product:   "wow", locale: "en_US", dataset: "items",
		requests: 4, concurrency: 2, requestTimeout: time.Second,
		datasetP95Threshold: time.Second, summaryP95Threshold: time.Second, detailP95Threshold: time.Second,
	})
	if err == nil {
		t.Fatal("missing DATABASE_URL was accepted")
	}
}

func TestPercentileUsesNearestRank(t *testing.T) {
	values := []time.Duration{time.Millisecond, 2 * time.Millisecond, 3 * time.Millisecond, 4 * time.Millisecond, 5 * time.Millisecond}
	if got := percentile(values, 95); got != 5*time.Millisecond {
		t.Fatalf("p95=%s, want 5ms", got)
	}
}

func TestDurationMillisecondsPreservesSubMillisecondPrecision(t *testing.T) {
	if got := durationMilliseconds(1500 * time.Microsecond); got != 1.5 {
		t.Fatalf("milliseconds=%v, want 1.5", got)
	}
}
