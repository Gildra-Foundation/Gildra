package raidbots

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientReadsMetadataAndTrees(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/live/metadata.json":
			fmt.Fprint(w, `{"environment":"live","wowBuild":"12.1.0.69404","contentHash":"abc","files":["talents.json"]}`)
		case "/live/talents.json":
			fmt.Fprint(w, `[{"traitTreeId":850,"className":"Warrior","classId":1,"specName":"Arms","specId":71,"specNodes":[]}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := New(server.URL, server.Client())
	metadata, err := client.Metadata(t.Context(), "live")
	if err != nil {
		t.Fatal(err)
	}
	if metadata.WoWBuild != "12.1.0.69404" {
		t.Fatalf("build = %q, want 12.1.0.69404", metadata.WoWBuild)
	}
	trees, err := client.TalentTrees(t.Context(), "live")
	if err != nil {
		t.Fatal(err)
	}
	if len(trees) != 1 || trees[0].SpecID != 71 || len(trees[0].Raw) == 0 {
		t.Fatalf("unexpected trees: %#v", trees)
	}
}

func TestClientRejectsHTTPError(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	if _, err := New(server.URL, server.Client()).Metadata(t.Context(), "live"); err == nil {
		t.Fatal("Metadata() error = nil, want HTTP error")
	}
}
