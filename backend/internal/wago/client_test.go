package wago

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestCurrentBuildForProductUsesLiveManifest(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/builds" {
			t.Fatalf("path = %q, want /api/builds", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"wow":             []map[string]string{{"version": "12.1.0.69497"}},
			"wow_classic_era": []map[string]string{{"version": "1.15.9.69547"}},
		})
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})
	for product, want := range map[string]string{
		"wow":                  "12.1.0.69497",
		"wow_classic_era":      "1.15.9.69547",
		"wow_classic_hardcore": "1.15.9.69547",
	} {
		got, err := client.CurrentBuildForProduct(t.Context(), product)
		if err != nil {
			t.Fatalf("product %s: %v", product, err)
		}
		if got != want {
			t.Errorf("product %s build = %q, want %q", product, got, want)
		}
	}
}

func TestCurrentBuild(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", `attachment; filename="ItemSparse.12.1.0.69404.csv"`)
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})
	build, err := client.CurrentBuild(t.Context(), "ItemSparse", "enUS")
	if err != nil {
		t.Fatal(err)
	}
	if build != "12.1.0.69404" {
		t.Fatalf("build = %q", build)
	}
}

func TestRowsRetriesTransientStatus(t *testing.T) {
	t.Parallel()
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			http.Error(w, "try again", http.StatusGatewayTimeout)
			return
		}
		fmt.Fprint(w, "ID,Name_lang\n1,Alpha\n")
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL, RetryMax: 1, RetryDelay: time.Millisecond})
	count, err := client.Rows(t.Context(), "SpellName", "12.1.0.69404", "enUS", 1, func(map[string]string) error {
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 || requests.Load() != 2 {
		t.Fatalf("count=%d requests=%d", count, requests.Load())
	}
}

func TestRowsReportsUnavailableExport(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no export for this build", http.StatusNotFound)
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL, RetryDelay: time.Millisecond})
	_, err := client.Rows(t.Context(), "ItemXItemEffect", "5.5.4.67732", "enUS", 0, func(map[string]string) error {
		return nil
	})
	if err == nil || !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
	var unavailable *UnavailableError
	if !errors.As(err, &unavailable) || unavailable.Table != "ItemXItemEffect" || unavailable.Build != "5.5.4.67732" {
		t.Fatalf("unavailable error = %#v", unavailable)
	}
}

func TestRowsStreamsAndLimits(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ID,Name_lang\n1,Alpha\n2,Beta\n3,Gamma\n")
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})
	var names []string
	count, err := client.Rows(context.Background(), "SpellName", "12.1.0.69404", "enUS", 2, func(row map[string]string) error {
		names = append(names, row["Name_lang"])
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 || len(names) != 2 || names[1] != "Beta" {
		t.Fatalf("count=%d names=%v", count, names)
	}
}

func TestRowsWithProofOnlyCertifiesCompleteResponses(t *testing.T) {
	t.Parallel()
	const body = "ID,Name_lang\n1,Alpha\n2,Beta\n3,Gamma\n"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"proof-etag"`)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})

	count, bounded, err := client.RowsWithProof(t.Context(), "SpellName", "12.1.0.69404", "enUS", 1, func(map[string]string) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 || bounded.Complete || len(bounded.SHA256) != 0 {
		t.Fatalf("bounded proof = (%d,%#v), want an explicitly incomplete proof", count, bounded)
	}

	count, complete, err := client.RowsWithProof(t.Context(), "SpellName", "12.1.0.69404", "enUS", 0, func(map[string]string) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	wantHash := sha256.Sum256([]byte(body))
	if count != 3 || !complete.Complete || complete.ByteSize != int64(len(body)) || complete.ETag != `"proof-etag"` ||
		string(complete.SHA256) != string(wantHash[:]) {
		t.Fatalf("complete proof = (%d,%#v), want SHA-256 and byte size for all response bytes", count, complete)
	}
}

func TestDefaultClientLeavesStreamingBodyDeadlineToContext(t *testing.T) {
	t.Parallel()
	client := New(Config{})
	if client.httpClient.Timeout != 0 {
		t.Fatalf("HTTP client timeout = %s, want context-bounded streaming", client.httpClient.Timeout)
	}
	transport, ok := client.httpClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("HTTP transport = %T, want *http.Transport", client.httpClient.Transport)
	}
	if transport.ResponseHeaderTimeout != defaultResponseHeaderTimeout {
		t.Fatalf("response header timeout = %s, want %s", transport.ResponseHeaderTimeout, defaultResponseHeaderTimeout)
	}
}
