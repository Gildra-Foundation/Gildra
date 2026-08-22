package wago

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestItemDescriptionsFiltersEmptyRows(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("build") != "12.1.0.69404" || r.URL.Query().Get("locale") != "ruRU" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		fmt.Fprint(w, "ID,Display_lang,Description_lang\n1,Меч,Описание\n2,Щит,\n")
	}))
	t.Cleanup(server.Close)
	rows, err := New(server.URL, server.Client()).ItemDescriptions(t.Context(), "12.1.0.69404", "ruRU", "ru_RU", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ExternalID != 1 || rows[0].Locale != "ru_RU" || rows[0].Description != "Описание" {
		t.Fatalf("unexpected descriptions: %#v", rows)
	}
}
