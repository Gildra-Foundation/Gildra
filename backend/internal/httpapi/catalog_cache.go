package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
)

// CachePublicCatalog adds validators and a bounded shared-cache policy to
// immutable-by-build catalog reads. It intentionally leaves health, analytics
// and mutation routes untouched.
func CachePublicCatalog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, "/v1/game/") {
			next.ServeHTTP(w, r)
			return
		}
		recorder := httptest.NewRecorder()
		next.ServeHTTP(recorder, r)
		response := recorder.Result()
		defer response.Body.Close()
		body := recorder.Body.Bytes()
		for key, values := range response.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		if response.StatusCode == http.StatusOK {
			digest := sha256.Sum256(body)
			etag := `"` + base64.RawURLEncoding.EncodeToString(digest[:]) + `"`
			w.Header().Set("ETag", etag)
			w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400")
			w.Header().Add("Vary", "Accept-Encoding")
			if r.Header.Get("If-None-Match") == etag {
				w.Header().Del("Content-Length")
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(body)
	})
}
