package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"
)

// LongRunningPrefixes are request paths that bound their own work or stream
// files: admin tools set per-query timeouts, simulations allow up to a
// minute, and media responses must not be cut off mid-transfer.
var LongRunningPrefixes = []string{
	"/v1/admin/", "/v1/auth/", "/v1/wow/rotation/", "/v1/wow/gear/",
	"/v1/media/", "/genshin-impact/media/", "/league-of-legends/media/",
}

// LimitRequestDuration gives every other request a context deadline. The
// http.Server write timeout does not cancel the request context, so without
// this a slow query kept a pool connection busy long after the client had
// received a timeout.
func LimitRequestDuration(next http.Handler, timeout time.Duration, exemptPrefixes []string) http.Handler {
	if timeout <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, prefix := range exemptPrefixes {
			if strings.HasPrefix(r.URL.Path, prefix) {
				next.ServeHTTP(w, r)
				return
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
