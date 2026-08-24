package wago

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

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
