package catalogmedia

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("224.0.0.0/4"), netip.MustParsePrefix("fc00::/7"), netip.MustParsePrefix("fe80::/10"),
}

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
