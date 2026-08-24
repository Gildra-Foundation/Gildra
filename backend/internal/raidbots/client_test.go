package raidbots

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMetadataAndArray(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/static/data/live/metadata.json":
			fmt.Fprint(w, `{"environment":"live","wowBuild":"12.1.0.69382","contentHash":"abc","generatedAt":"2026-08-19T22:07:03Z","files":["items.json"]}`)
		case "/static/data/live/items.json":
			fmt.Fprint(w, `[{"id":1},{"id":2},{"id":3}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})
	metadata, err := client.Metadata(t.Context(), "live")
	if err != nil {
		t.Fatal(err)
	}
	if metadata.WoWBuild != "12.1.0.69382" {
		t.Fatalf("build = %q", metadata.WoWBuild)
	}
	count, err := client.Array(t.Context(), "live", "items.json", 2, func(record json.RawMessage) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("count = %d, want 2", count)
	}
}

func TestItemNamesSelectsRequestedIDs(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"ItemSparse":{"25":{"en_US":"Sword","ru_RU":"Меч"},"35":{"en_US":"Staff"},"36":{"ru_RU":"Палица"}}}`)
	}))
	t.Cleanup(server.Close)
	client := New(Config{BaseURL: server.URL})
	wanted := map[int64]struct{}{25: {}, 36: {}}
	got := map[int64]string{}
	count, err := client.ItemNames(t.Context(), "live", wanted, func(id int64, names map[string]string) error {
		got[id] = names["ru_RU"]
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 || got[25] != "Меч" || got[36] != "Палица" {
		t.Fatalf("count=%d names=%v", count, got)
	}
}
