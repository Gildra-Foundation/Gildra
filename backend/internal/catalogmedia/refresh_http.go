package catalogmedia

import (
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// pacedTransport keeps one maintenance job to a single slow request stream:
// every request, official or fallback, waits for the configured interval, and
// a host that answers 429 or 503 pauses the whole stream.
type pacedTransport struct {
	base     http.RoundTripper
	interval time.Duration
	mu       sync.Mutex
	next     time.Time
	// trouble counts answers that say nothing about the asset itself: 429,
	// any 5xx and transport errors. primaryTrouble counts those from
	// primaryHost, so a caller can stop pushing a host that is throttling or
	// down without giving up because of a flaky fallback.
	primaryHost    string
	trouble        atomic.Int64
	primaryTrouble atomic.Int64
}

// throttleBackoff is the shortest pause after a 429 or 503; a longer
// Retry-After wins. A variable so tests need not wait a real minute.
var throttleBackoff = time.Minute

func (p *pacedTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if delay := time.Until(p.next); delay > 0 {
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-request.Context().Done():
			return nil, request.Context().Err()
		}
	}
	p.next = time.Now().Add(p.interval)
	response, err := p.base.RoundTrip(request)
	if err != nil || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= http.StatusInternalServerError {
		p.trouble.Add(1)
		if request.URL.Hostname() == p.primaryHost {
			p.primaryTrouble.Add(1)
		}
	}
	if response != nil && (response.StatusCode == http.StatusTooManyRequests || response.StatusCode == http.StatusServiceUnavailable) {
		delay := throttleBackoff
		if seconds, err := strconv.Atoi(response.Header.Get("Retry-After")); err == nil && seconds > 0 {
			delay = max(delay, time.Duration(seconds)*time.Second)
		} else if deadline, err := http.ParseTime(response.Header.Get("Retry-After")); err == nil {
			delay = max(delay, time.Until(deadline))
		}
		p.next = time.Now().Add(delay)
	}
	return response, err
}

func pacedClient(client *http.Client, interval time.Duration, primaryHost string) (*http.Client, *pacedTransport) {
	paced := *client
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	transport := &pacedTransport{base: base, interval: interval, primaryHost: primaryHost}
	paced.Transport = transport
	return &paced, transport
}

func rateLimitedClient(client *http.Client, interval time.Duration) *http.Client {
	paced, _ := pacedClient(client, interval, "")
	return paced
}
