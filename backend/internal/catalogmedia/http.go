package catalogmedia

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("224.0.0.0/4"), netip.MustParsePrefix("fc00::/7"), netip.MustParsePrefix("fe80::/10"),
}

const (
	mediaRequestAttempts = 3
	mediaRetryBaseDelay  = 250 * time.Millisecond
	mediaRetryMaxDelay   = 2 * time.Second
	mediaRetryDrainBytes = 1 << 20
)

func validateRemoteURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return nil, errors.New("media source must be an absolute HTTPS URL without credentials")
	}
	if ip, err := netip.ParseAddr(parsed.Hostname()); err == nil && blockedIP(ip) {
		return nil, errors.New("media source IP is not public")
	}
	return parsed, nil
}

func blockedIP(ip netip.Addr) bool {
	if !ip.IsValid() || ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() {
		return true
	}
	for _, network := range blockedNetworks {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func SafeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{ForceAttemptHTTP2: true}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, candidate := range addresses {
			ip, ok := netip.AddrFromSlice(candidate.AsSlice())
			if !ok || blockedIP(ip.Unmap()) {
				continue
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		}
		return nil, fmt.Errorf("media host %q has no public address", host)
	}
	return &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: func(request *http.Request, _ []*http.Request) error {
		_, err := validateRemoteURL(request.URL.String())
		return err
	}}
}

// doMediaRequest makes a bounded number of attempts for transient upstream
// failures. A media cache run can process tens of thousands of assets, so a
// single transient CDN error must not permanently turn an otherwise valid
// asset into a failed observation. Permanent client errors (for example
// missing assets or forbidden URLs) are returned immediately.
//
// The URL must already have passed validateRemoteURL. Redirects are still
// checked by SafeHTTPClient.CheckRedirect, and response bodies from retryable
// attempts are drained and closed before the next attempt.
func doMediaRequest(ctx context.Context, client *http.Client, parsed *url.URL) (*http.Response, error) {
	if client == nil {
		return nil, errors.New("media HTTP client is required")
	}
	if parsed == nil {
		return nil, errors.New("media URL is required")
	}

	var lastErr error
	for attempt := 0; attempt < mediaRequestAttempts; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("User-Agent", catalogMediaUserAgent)
		response, err := client.Do(request)
		if err == nil && response == nil {
			err = errors.New("media HTTP client returned a nil response")
		}
		if err == nil && !retryableMediaStatus(response.StatusCode) {
			return response, nil
		}

		var retryAfter time.Duration
		if err != nil {
			if response != nil && response.Body != nil {
				_ = response.Body.Close()
			}
			lastErr = fmt.Errorf("media request attempt %d/%d: %w", attempt+1, mediaRequestAttempts, err)
		} else {
			lastErr = fmt.Errorf("media request attempt %d/%d: HTTP %d", attempt+1, mediaRequestAttempts, response.StatusCode)
			retryAfter = mediaRetryAfter(response.Header.Get("Retry-After"), time.Now())
			if response.Body != nil {
				_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, mediaRetryDrainBytes))
				_ = response.Body.Close()
			}
		}
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if attempt == mediaRequestAttempts-1 {
			break
		}
		delay := mediaRetryBaseDelay << attempt
		if retryAfter > 0 {
			delay = retryAfter
		}
		if delay > mediaRetryMaxDelay {
			delay = mediaRetryMaxDelay
		}
		timer := time.NewTimer(delay)
		select {
		case <-timer.C:
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}

func retryableMediaStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooEarly ||
		status == http.StatusTooManyRequests || status >= http.StatusInternalServerError
}

// mediaRetryAfter accepts both forms defined by RFC 9110: a number of
// seconds or an HTTP date. The value is capped by the caller so a malicious
// upstream cannot hold a worker indefinitely.
func mediaRetryAfter(value string, now time.Time) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil {
		if seconds <= 0 {
			return 0
		}
		return time.Duration(seconds) * time.Second
	}
	when, err := http.ParseTime(value)
	if err != nil {
		return 0
	}
	if delay := when.Sub(now); delay > 0 {
		return delay
	}
	return 0
}
