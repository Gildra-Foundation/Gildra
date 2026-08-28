package battlenet

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func TestOAuthErrorDoesNotExposeResponseDescriptionOrCredentials(t *testing.T) {
	t.Parallel()
	const secret = "must-not-appear"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintf(w, `{"error":"invalid_client","error_description":"rejected %s"}`, secret)
	}))
	t.Cleanup(server.Close)

	client, err := New(Config{
		ClientID: "id", ClientSecret: secret, TokenURL: server.URL,
		APIBaseURL: func(string) string { return server.URL },
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Search(context.Background(), "us", "static-us", "en_US", "item", 1, 1)
	if err == nil {
		t.Fatal("expected OAuth failure")
	}
	if strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "error_description") {
		t.Fatalf("OAuth error exposed sensitive response content: %v", err)
	}
	var oauthErr *OAuthError
	if !errors.As(err, &oauthErr) {
		t.Fatalf("error type = %T, want *OAuthError", err)
	}
	if oauthErr.StatusCode != http.StatusUnauthorized || oauthErr.Code != "invalid_client" {
		t.Fatalf("OAuth error = %#v", oauthErr)
	}
}

func TestOAuthErrorRejectsUnsafeMachineCode(t *testing.T) {
	t.Parallel()
	if got := safeOAuthErrorCode([]byte(`{"error":"secret value"}`)); got != "" {
		t.Fatalf("unsafe OAuth code = %q", got)
	}
}

func TestSearchAuthenticatesAndBuildsQuery(t *testing.T) {
	t.Parallel()
	var tokenCalls atomic.Int32
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		tokenCalls.Add(1)
		if user, pass, ok := r.BasicAuth(); !ok || user != "id" || pass != "secret" {
			t.Fatalf("unexpected basic auth: %q %q %v", user, pass, ok)
		}
		fmt.Fprint(w, `{"access_token":"token"}`)
	})
	mux.HandleFunc("/data/wow/search/item", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization = %q", got)
		}
		if r.URL.Query().Get("namespace") != "static-us" || r.URL.Query().Get("locale") != "en_US" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		fmt.Fprint(w, `{"page":1,"pageCount":1,"results":[{"data":{"id":19019}}]}`)
	})

	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		page, err := client.Search(context.Background(), "us", "static-us", "en_US", "item", 1, 100)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Results) != 1 {
			t.Fatalf("results = %d", len(page.Results))
		}
	}
	if tokenCalls.Load() != 1 {
		t.Fatalf("token calls = %d", tokenCalls.Load())
	}
}

func TestSearchRangeEncodesInclusiveIDBounds(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		if got := r.URL.Query().Get("id"); got != "[1001,2000]" {
			t.Fatalf("id range = %q", got)
		}
		fmt.Fprint(w, `{"page":1,"pageCount":1,"results":[]}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.SearchRange(context.Background(), "us", "static-us", "en_US", "item", 1, 100, 1001, 2000); err != nil {
		t.Fatal(err)
	}
}

func TestMaxExternalIDUsesDescendingOfficialSearch(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		if got := r.URL.Query().Get("orderby"); got != "id:desc" {
			t.Fatalf("orderby = %q", got)
		}
		if got := r.URL.Query().Get("_pageSize"); got != "1" {
			t.Fatalf("page size = %q", got)
		}
		fmt.Fprint(w, `{"page":1,"pageCount":1000,"results":[{"data":{"id":246062}}]}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	maxID, err := client.MaxExternalID(context.Background(), "us", "static-classic1x-us", "en_US", "item")
	if err != nil {
		t.Fatal(err)
	}
	if maxID != 246062 {
		t.Fatalf("max ID = %d", maxID)
	}
}

func TestMaxExternalIDAllowsEmptyOfficialIndex(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		fmt.Fprint(w, `{"page":1,"pageCount":0,"results":[]}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	maxID, err := client.MaxExternalID(context.Background(), "us", "static-classic-us", "en_US", "spell")
	if err != nil {
		t.Fatal(err)
	}
	if maxID != 0 {
		t.Fatalf("max ID = %d", maxID)
	}
}

func TestDetailReportsRemoteError(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		http.Error(w, "missing", http.StatusNotFound)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = client.Detail(context.Background(), "us", "static-us", "en_US", "spell", 1)
	if err == nil || !strings.Contains(err.Error(), "404") || !IsNotFound(err) {
		t.Fatalf("error = %v", err)
	}
}

func TestIndexBuildsOfficialResourceURL(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		if r.URL.Path != "/data/wow/quest/index" || r.URL.Query().Get("namespace") != "static-eu" {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		fmt.Fprint(w, `{"quests":[{"id":1}]}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	payload, _, err := client.Index(context.Background(), "eu", "static-eu", "ru_RU", "quest")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), `"quests"`) {
		t.Fatalf("payload = %s", payload)
	}
}

func TestFetchLinkKeepsPinnedNamespaceAndAddsLocale(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"token"}`)
			return
		}
		if r.URL.Query().Get("namespace") != "static-12.1.0_68914-us" || r.URL.Query().Get("locale") != "ru_RU" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		fmt.Fprint(w, `{"id":1,"name":"localized"}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	payload, _, err := client.FetchLink(context.Background(), "us", "ru_RU", server.URL+"/data/wow/item/1?namespace=static-12.1.0_68914-us")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), "localized") {
		t.Fatalf("payload = %s", payload)
	}
}

func TestFetchLinkRejectsDifferentOrigin(t *testing.T) {
	t.Parallel()
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", APIBaseURL: func(string) string { return "https://us.api.blizzard.com" }})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.FetchLink(context.Background(), "us", "en_US", "https://example.test/data/wow/item/1"); err == nil {
		t.Fatal("expected cross-origin resource link rejection")
	}
}

func TestBuildFromResourceLink(t *testing.T) {
	t.Parallel()
	build, version, err := buildFromResourceLink("https://us.api.blizzard.com/data/wow/item/25?namespace=static-12.1.0_68914-us")
	if err != nil {
		t.Fatal(err)
	}
	if build != 68914 || version != "12.1.0.68914" {
		t.Fatalf("build = %d, version = %q", build, version)
	}
}

func TestBuildFromClassicResourceLink(t *testing.T) {
	t.Parallel()
	build, version, err := buildFromResourceLink("https://us.api.blizzard.com/data/wow/item/25?namespace=static-1.15.9_68185-classic1x-us")
	if err != nil {
		t.Fatal(err)
	}
	if build != 68185 || version != "1.15.9.68185" {
		t.Fatalf("build = %d, version = %q", build, version)
	}
}

func TestRetryableRequestErrorRecognizesNetworkTimeout(t *testing.T) {
	t.Parallel()
	err := &url.Error{Op: "Get", URL: "https://us.api.blizzard.com", Err: context.DeadlineExceeded}
	if !retryableRequestError(err) {
		t.Fatal("expected network timeout to be retryable")
	}
}

func TestRequestRefreshesExpiredServerTokenAfterUnauthorized(t *testing.T) {
	t.Parallel()
	var tokenCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			call := tokenCalls.Add(1)
			fmt.Fprintf(w, `{"access_token":"token-%d","expires_in":3600}`, call)
			return
		}
		if r.Header.Get("Authorization") == "Bearer token-1" {
			http.Error(w, "expired", http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"page":1,"pageCount":1,"results":[]}`)
	}))
	t.Cleanup(server.Close)
	client, err := New(Config{ClientID: "id", ClientSecret: "secret", TokenURL: server.URL + "/token", APIBaseURL: func(string) string { return server.URL }})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Search(context.Background(), "us", "static-us", "en_US", "item", 1, 100); err != nil {
		t.Fatal(err)
	}
	if tokenCalls.Load() != 2 {
		t.Fatalf("token calls = %d", tokenCalls.Load())
	}
}
