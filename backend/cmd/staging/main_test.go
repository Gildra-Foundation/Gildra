package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestCatalogBoundary(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		for _, name := range []string{"Authorization", "Cookie", "X-Workspace-Owner", "X-Forwarded-For"} {
			if r.Header.Get(name) != "" {
				t.Errorf("forwarded private header %s", name)
			}
		}
		if r.URL.Query().Get("q") != "talents" {
			t.Error("lost catalog query")
		}
		w.Header().Set("Set-Cookie", "private=unsafe")
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	origin, _ := url.Parse(upstream.URL)
	handler := catalogProxy(origin)
	for _, row := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/v1/game/products?q=talents", 200},
		{"HEAD", "/v1/media/123?q=talents", 200},
		{"GET", "/v1/library/datasets?q=talents", 200},
		{"POST", "/v1/game/products", 405},
		{"PUT", "/v1/wow/workspace/talent-builds", 405},
		{"DELETE", "/v1/game/products", 405},
		{"GET", "/v1/admin/users", 404},
		{"GET", "/v1/wow/workspace", 404},
		{"GET", "/v1/analytics/overview", 404},
	} {
		r := httptest.NewRequest(row.method, row.path, nil)
		for _, name := range []string{"Authorization", "Cookie", "X-Workspace-Owner", "X-Forwarded-For"} {
			r.Header.Set(name, "private")
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != row.status {
			t.Errorf("%s %s: %d", row.method, row.path, w.Code)
		}
		if w.Header().Get("Set-Cookie") != "" {
			t.Error("forwarded upstream cookie")
		}
	}
	if calls != 3 {
		t.Errorf("unexpected production request count %d", calls)
	}
}
