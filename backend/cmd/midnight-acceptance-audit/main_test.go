package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFetchCachedMediaRequiresPublicImage(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		status      int
		contentType string
		wantError   string
	}{
		{name: "cached image", status: http.StatusOK, contentType: "image/jpeg"},
		{name: "missing image", status: http.StatusNotFound, contentType: "text/plain", wantError: "HTTP 404"},
		{name: "html response", status: http.StatusOK, contentType: "text/html", wantError: "not an image"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				writer.Header().Set("Content-Type", test.contentType)
				writer.WriteHeader(test.status)
			}))
			defer server.Close()
			err := fetchCachedMedia(context.Background(), server.Client(), map[string]any{"iconUrl": server.URL + "/v1/media/icon"})
			if test.wantError == "" && err != nil {
				t.Fatalf("fetchCachedMedia() = %v", err)
			}
			if test.wantError != "" && (err == nil || !strings.Contains(err.Error(), test.wantError)) {
				t.Fatalf("fetchCachedMedia() = %v, want %q", err, test.wantError)
			}
		})
	}
}

func TestValidateEmbeddedLocalizations(t *testing.T) {
	t.Parallel()
	valid := map[string]any{
		"localizations": map[string]any{
			"en_US": map[string]any{"name": "Arcane Trinket", "description": "A verified description."},
			"ru_RU": map[string]any{"name": "Чародейская безделушка", "description": "Проверенное описание."},
		},
	}
	if err := validateEmbeddedLocalizations(valid); err != nil {
		t.Fatalf("valid embedded localizations: %v", err)
	}

	invalid := map[string]any{
		"localizations": map[string]any{
			"en_US": map[string]any{"name": "Arcane Trinket"},
			"ru_RU": map[string]any{"name": "[DNT] Placeholder"},
		},
	}
	if err := validateEmbeddedLocalizations(invalid); err == nil || !strings.Contains(err.Error(), "invalid ru_RU name") {
		t.Fatalf("invalid embedded localizations error = %v", err)
	}
}

func TestValidateDisplayRequiresItemMediaOnlyWhenTheRecordLacksIt(t *testing.T) {
	payload := map[string]any{
		"name":                "Bright Linen Spellthread",
		"description":         "Verified description.",
		"resolvedDescription": "Verified description.",
		"iconUrl":             "https://api.gildra.net/v1/media/example",
	}
	if err := validateDisplay(payload, "item", true); err != nil {
		t.Fatalf("verified item media was rejected: %v", err)
	}
	if err := validateDisplay(payload, "item", false); err == nil || !strings.Contains(err.Error(), "missing verified primary media") {
		t.Fatalf("unverified item media error = %v", err)
	}
}

func TestSelectTemplateShardKeepsEveryRecordExactlyOnce(t *testing.T) {
	t.Parallel()
	records := []record{
		{ID: "a"},
		{ID: "b"},
		{ID: "c"},
		{ID: "d"},
		{ID: "e"},
	}
	want := [][]string{{"a", "d"}, {"b", "e"}, {"c"}}
	seen := make(map[string]int, len(records))
	for shard, wantIDs := range want {
		selected := selectTemplateShard(records, len(want), shard)
		if len(selected) != len(wantIDs) {
			t.Fatalf("shard %d length = %d, want %d", shard, len(selected), len(wantIDs))
		}
		for index, item := range selected {
			if item.ID != wantIDs[index] {
				t.Fatalf("shard %d record %d = %q, want %q", shard, index, item.ID, wantIDs[index])
			}
			seen[item.ID]++
		}
	}
	for _, item := range records {
		if seen[item.ID] != 1 {
			t.Fatalf("record %q was selected %d times", item.ID, seen[item.ID])
		}
	}
}

func TestCheckTemplateRecordUsesEmbeddedBilingualLocalizations(t *testing.T) {
	t.Parallel()
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests++
		if got := request.URL.Query().Get("locale"); got != "en_US" {
			t.Errorf("requested locale = %q, want en_US", got)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"name":"Arcane Trinket",
			"description":"Verified description.",
			"resolvedDescription":"Verified description.",
			"localizations":{
				"en_US":{"name":"Arcane Trinket","description":"Verified description."},
				"ru_RU":{"name":"Чародейская безделушка","description":"Проверенное описание."}
			}
		}`))
	}))
	defer server.Close()
	checked, failures := checkTemplateRecord(context.Background(), server.Client(), server.URL, record{ID: "example", Type: "spell", ExternalID: 1, Decision: "eligible"})
	if checked != 1 || len(failures) != 0 {
		t.Fatalf("checkTemplateRecord() = requests=%d failures=%#v", checked, failures)
	}
	if requests != 1 {
		t.Fatalf("HTTP requests = %d, want 1", requests)
	}
}
