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
