package mythicbuilds

import (
	"context"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"testing"
	"time"
)

// Only linked into a test binary. Production always uses the real Battle.net verifier.
func TestBrowserFixture(t *testing.T) {
	address := os.Getenv("MYTHIC_BUILDS_BROWSER_BIND")
	if address == "" {
		t.Skip("private browser fixture only")
	}
	service, pool, _ := testService(t)
	var database string
	if err := pool.QueryRow(context.Background(), `SELECT current_database()`).Scan(&database); err != nil || database != "mythic_fixture" {
		t.Fatal("refuse non-fixture database")
	}
	for _, account := range []string{"account-A", "account-B"} {
		hash, _ := owner(account)
		if _, err := pool.Exec(context.Background(), `DELETE FROM wow_mythic_talent_builds WHERE account_hash=$1`, hash); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	NewHandler(service, fakeIdentity{}).Register(mux)
	target, _ := url.Parse("https://api.gildra.net")
	proxy := httputil.NewSingleHostReverseProxy(target)
	original := proxy.Director
	proxy.Director = func(r *http.Request) {
		original(r)
		r.Host = target.Host
		r.Header.Del("Authorization")
		r.Header.Del("Cookie")
		r.Header.Del("X-Mythic-Account")
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		http.Error(w, "fixture upstream unavailable", 503)
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "fixture read-only proxy", 405)
			return
		}
		proxy.ServeHTTP(w, r)
	})
	listener, err := net.Listen("tcp", address)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	failures := make(chan error, 1)
	go func() { failures <- server.Serve(listener) }()
	select {
	case err := <-failures:
		t.Fatal(err)
	case <-time.After(40 * time.Minute):
	}
}
