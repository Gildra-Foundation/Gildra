package catalogmedia

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func TestRefreshHTTPBackoffCanBeCancelled(t *testing.T) {
	calls := 0
	client := rateLimitedClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 429, Header: http.Header{"Retry-After": []string{"120"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}, time.Millisecond)
	req, _ := http.NewRequest(http.MethodGet, "https://render.worldofwarcraft.com/test", nil)
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err = client.Do(req.WithContext(ctx)); err == nil {
		t.Fatal("backoff ignored cancellation")
	}
	if calls != 1 {
		t.Fatalf("backoff sent %d requests", calls)
	}
}

func TestRefreshHTTPPacesRequests(t *testing.T) {
	var starts []time.Time
	client := rateLimitedClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		starts = append(starts, time.Now())
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}, nil
	})}, 20*time.Millisecond)
	for range 3 {
		req, _ := http.NewRequest(http.MethodGet, "https://render.worldofwarcraft.com/test", nil)
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
	}
	for i := 1; i < len(starts); i++ {
		if starts[i].Sub(starts[i-1]) < 19*time.Millisecond {
			t.Fatal("requests burst faster than configured rate")
		}
	}
}

func TestOfficialIconURLPreservesClientPunctuation(t *testing.T) {
	for _, name := range []string{"inv_misc_fork&knife", "inv-mount_raven_54", "achievement_boss_kael'thassunstrider_01"} {
		endpoint, err := officialIconURL(name)
		if err != nil || !strings.HasPrefix(endpoint, officialIconOrigin) {
			t.Fatalf("client name %q URL=%q err=%v", name, endpoint, err)
		}
	}
}

func TestRefreshUnsafeNameUsesProvenFileID(t *testing.T) {
	raw := syntheticBLP2(2, 0, 0, []byte{0, 248, 0, 0, 0, 0, 0, 0})
	root := t.TempDir()
	handle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	defer handle.Close()
	c := &Cache{rootPath: root, root: handle, client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "wago.tools" || r.URL.Path != "/api/casc/5351060" {
			t.Fatalf("unsafe name leaked into render URL: %s", r.URL)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
	})}}
	id := int64(5351060)
	result, err := c.fetchIcon(context.Background(), iconCandidate{Name: "interface/icons/test", FileDataID: &id}, "wow", "12.1.0.69587")
	if err != nil || result.Source != "wago_tools" || result.CachedSize == 0 {
		t.Fatalf("file ID fallback=%+v err=%v", result, err)
	}
}

func TestSourceLacksAsset(t *testing.T) {
	missing := fmt.Errorf("official render: %w", fmt.Errorf("download media: %w", sourceStatusError{"render.worldofwarcraft.com", 403}))
	mirror := fmt.Errorf("name fallback: %w", fmt.Errorf("download media: %w", sourceStatusError{"wow.zamimg.com", 404}))
	wagoBurst := fmt.Errorf("Wago CASC fallback: %w", fmt.Errorf("download BLP2: %w", sourceStatusError{"wago.tools", 403}))
	for _, test := range []struct {
		err   error
		lacks bool
	}{
		{nil, false}, {missing, true}, {errors.Join(missing, mirror), true},
		{errors.Join(missing, mirror, wagoBurst), false},
		{errors.Join(missing, fmt.Errorf("name fallback: %w", context.DeadlineExceeded)), false},
		{fmt.Errorf("download media: %w", sourceStatusError{"render.worldofwarcraft.com", 502}), false},
		{errBlankRender, true},
	} {
		if got := sourceLacksAsset(test.err); got != test.lacks {
			t.Fatalf("sourceLacksAsset(%v)=%v", test.err, got)
		}
	}
	if missing.Error() != "official render: download media: HTTP 403" {
		t.Fatalf("source error text changed: %q", missing.Error())
	}
}

func TestRefreshFailureTolerance(t *testing.T) {
	for _, test := range []struct {
		failed    int64
		attempted int
		exceeded  bool
	}{
		{0, 3000, false}, {14, 2000, false}, {3, 5, false}, {9, 9, false},
		{10, 10, true}, {300, 3000, false}, {301, 3000, true},
	} {
		if got := refreshFailuresExceedTolerance(test.failed, test.attempted); got != test.exceeded {
			t.Fatalf("failed=%d attempted=%d exceeded=%v", test.failed, test.attempted, got)
		}
	}
}

func TestPacedTransportSeparatesPrimaryHostTrouble(t *testing.T) {
	previous := throttleBackoff
	throttleBackoff = time.Millisecond
	t.Cleanup(func() { throttleBackoff = previous })
	client, pace := pacedClient(&http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		status := http.StatusForbidden
		switch request.URL.Path {
		case "/throttled":
			status = http.StatusTooManyRequests
		case "/broken":
			status = http.StatusBadGateway
		}
		return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(""))}, nil
	})}, time.Millisecond, "render.worldofwarcraft.com")
	for _, endpoint := range []string{
		"https://render.worldofwarcraft.com/missing", "https://render.worldofwarcraft.com/throttled",
		"https://wow.zamimg.com/broken", "https://wow.zamimg.com/missing",
	} {
		request, _ := http.NewRequest(http.MethodGet, endpoint, nil)
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
	}
	// A 403 is an answer about the asset; 429 and 5xx are not.
	if pace.trouble.Load() != 2 || pace.primaryTrouble.Load() != 1 {
		t.Fatalf("trouble=%d primary=%d", pace.trouble.Load(), pace.primaryTrouble.Load())
	}
}
