package gamecontentcollect

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/riverqueue/river"
)

func fixture(t *testing.T, module string) []byte {
	t.Helper()
	name := module
	if module == "raids" {
		name = "raiding"
	}
	raw, err := os.ReadFile("testdata/" + name + ".json")
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func TestNormalizeActualSourcesAndExplicitIdentities(t *testing.T) {
	for _, target := range Targets() {
		facts, warnings, err := Normalize(target, fixture(t, target.ModuleID))
		if err != nil {
			t.Fatal(err)
		}
		if len(warnings) < 3 || facts["edition"] != "retail" {
			t.Fatal("source coverage lost")
		}
		if target.ModuleID == "raids" {
			raids := facts["raids"].(map[string]any)
			if len(raids) != 5 {
				t.Fatal("unknown upstream raids were dropped")
			}
			boss := raids["16340"].(map[string]any)["encounters"].(map[string]any)["197138"].(map[string]any)
			if boss["canonicalBossSlug"] != "chimaerus" || boss["canonicalRaidSlug"] != "the-dreamrift" {
				t.Fatal("aggregate tier was guessed as one raid")
			}
			if len(raids["16671"].(map[string]any)["canonicalRaidSlugs"].([]string)) != 0 {
				t.Fatal("unmapped raid guessed")
			}
		} else {
			dungeons := facts["dungeons"].(map[string]any)
			if len(dungeons) != 8 {
				t.Fatal("wrong season pool")
			}
			if dungeons["14063"].(map[string]any)["timerSeconds"] != 1680 {
				t.Fatal("wrong season timer")
			}
			if facts["season"].(map[string]any)["sourceSlug"] != "season-mn-2" {
				t.Fatal("selected season by ambiguous is_main_season")
			}
		}
		var reordered any
		if err = json.Unmarshal(fixture(t, target.ModuleID), &reordered); err != nil {
			t.Fatal(err)
		}
		again, _, err := Normalize(target, canonical(reordered))
		if err != nil || hash(canonical(again)) != hash(canonical(facts)) {
			t.Fatal("JSON object key order changed normalized facts", err)
		}
	}
}
func TestRejectsPartialAmbiguousAndUnsupportedInputs(t *testing.T) {
	for _, target := range Targets() {
		var raw map[string]any
		_ = json.Unmarshal(fixture(t, target.ModuleID), &raw)
		if target.ModuleID == "raids" {
			raids := raw["raids"].([]any)
			raw["raids"] = raids[1:]
		} else {
			seasons := raw["seasons"].([]any)
			season := seasons[0].(map[string]any)
			dungeons := season["dungeons"].([]any)
			season["dungeons"] = dungeons[1:]
		}
		if _, _, err := Normalize(target, canonical(raw)); err == nil {
			t.Fatal("accepted partial source")
		}
		target.Context.Edition = "forever"
		if _, _, err := Normalize(target, fixture(t, target.ModuleID)); err == nil {
			t.Fatal("retail adapter accepted Forever")
		}
	}
	target := Targets()[1]
	bad := strings.Replace(string(fixture(t, "mythic-plus")), `"keystone_timer_seconds":1800`, `"keystone_timer_seconds":0`, 1)
	if _, _, err := Normalize(target, []byte(bad)); err == nil {
		t.Fatal("accepted invalid timer")
	}
}
func TestDifferenceTracksValuesAndRemovals(t *testing.T) {
	a := map[string]any{"dungeons": map[string]any{"ruby": map[string]any{"timer": 1680, "name": "Ruby"}}}
	b := map[string]any{"dungeons": map[string]any{"ruby": map[string]any{"timer": 1710}}}
	d := Difference(a, b)
	if d.Total != 2 || d.Truncated {
		t.Fatal(d)
	}
	if d.Changes[0].Path != "/dungeons/ruby/name" || d.Changes[0].Kind != "removed" || d.Changes[1].Path != "/dungeons/ruby/timer" {
		t.Fatal(d)
	}
	if d = Difference(a, a); d.Total != 0 {
		t.Fatal("identical facts changed")
	}
}

func TestNewSeasonProducesReviewFactsWithoutSwitchingCurrentPool(t *testing.T) {
	target := Targets()[1]
	raw := fixture(t, "mythic-plus")
	before, _, err := Normalize(target, raw)
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	data["seasons"] = append(data["seasons"].([]any), map[string]any{"slug": "season-mn-3", "name": "MN Season 3", "blizzard_season_id": 19, "dungeons": []any{}})
	after, warnings, err := Normalize(target, canonical(data))
	if err != nil {
		t.Fatal(err)
	}
	if Difference(before, after).Total == 0 || !strings.Contains(strings.Join(warnings, ","), "unconfigured_season:season-mn-3") {
		t.Fatal("new season was silently ignored")
	}
	if after["season"].(map[string]any)["sourceSlug"] != "season-mn-2" || string(canonical(before["dungeons"])) != string(canonical(after["dungeons"])) {
		t.Fatal("new season automatically switched the configured pool")
	}
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func sourceResponse(status int, kind, body string, headers http.Header) *http.Response {
	if headers == nil {
		headers = http.Header{}
	}
	headers.Set("Content-Type", kind)
	return &http.Response{StatusCode: status, Header: headers, Body: io.NopCloser(strings.NewReader(body))}
}
func TestConditionalFetchAndSourceFailures(t *testing.T) {
	target := Targets()[1]
	for _, tc := range []struct {
		name     string
		status   int
		kind     string
		body     string
		previous *CachedArtifact
		headers  http.Header
		code     string
		retry    bool
	}{
		{"valid", 200, "application/json", `{"seasons":[]}`, nil, nil, "", false},
		{"304", 304, "", "", &CachedArtifact{Body: []byte(`{"cached":true}`), ETag: `"known"`}, nil, "", false},
		{"unbound304", 304, "", "", nil, nil, "unusable_304", false},
		{"blockpage", 200, "text/html", "<html>blocked</html>", nil, nil, "source_not_json", false},
		{"truncated", 200, "application/json", `{"seasons":`, nil, nil, "invalid_source_json", false},
		{"oversize", 200, "application/json", strings.Repeat("x", (1<<20)+1), nil, nil, "invalid_source_json", false},
		{"429", 429, "application/json", "private provider response", nil, http.Header{"Retry-After": []string{"7200"}}, "source_http_429", true},
		{"503", 503, "application/json", "private provider response", nil, nil, "source_http_503", true},
		{"404", 404, "application/json", "private provider response", nil, nil, "source_http_404", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := NewHTTPSource()
			s.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Host != "raider.io" || r.URL.Query().Get("expansion_id") != "11" || r.Header.Get("Authorization") != "" {
					t.Fatal("unexpected source or credentials")
				}
				if tc.previous != nil && r.Header.Get("If-None-Match") != tc.previous.ETag {
					t.Fatal("missing conditional header")
				}
				return sourceResponse(tc.status, tc.kind, tc.body, tc.headers), nil
			})
			r, err := s.Fetch(t.Context(), target, tc.previous)
			if tc.code == "" {
				if err != nil || len(r.Body) == 0 {
					t.Fatal(err)
				}
				return
			}
			var failure *Failure
			if !errors.As(err, &failure) || failure.Code != tc.code || failure.Retryable != tc.retry {
				t.Fatal(err)
			}
			if tc.status == 429 && failure.RetryAfter != 2*time.Hour {
				t.Fatal("Retry-After was shortened")
			}
			if strings.Contains(err.Error(), "private") {
				t.Fatal("provider response leaked into error")
			}
		})
	}
	now := time.Now().UTC().Truncate(time.Second)
	if got := retryAfter(now.Add(time.Hour).Format(http.TimeFormat), now); got != time.Hour {
		t.Fatal(got)
	}
	s := NewHTTPSource()
	target.Context.Edition = "forever"
	s.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { t.Fatal("unsupported context fetched"); return nil, nil })
	if _, err := s.Fetch(context.Background(), target, nil); err == nil {
		t.Fatal("unsupported adapter context accepted")
	}
}

func TestDailySlotsAndCatchup(t *testing.T) {
	day := time.Date(2026, 10, 22, 3, 20, 0, 0, time.UTC)
	raid, mythic := Targets()[0], Targets()[1]
	if got := JobArgs(raid, day); got.ScheduledFor != "2026-10-22T03:15:00Z" {
		t.Fatal(got)
	}
	if got := JobArgs(mythic, day); got.ScheduledFor != "2026-10-21T03:30:00Z" {
		t.Fatal(got)
	}
	for _, target := range Targets() {
		s := Schedule(target)
		for _, now := range []time.Time{day, day.Add(14 * 24 * time.Hour), time.Date(2026, 10, 25, 3, 15, 0, 0, time.UTC)} {
			if !s.Next(now).After(now) || s.Next(now).Sub(now) > 24*time.Hour || s.Due(now).After(now) {
				t.Fatal("wrong daily slot")
			}
			if JobArgs(target, now).RunKey == JobArgs(target, now.Add(24*time.Hour)).RunKey {
				t.Fatal("consecutive days share idempotency key")
			}
		}
	}
}

func TestWorkerConsumesObsoleteQueuedSlotsWithoutCollecting(t *testing.T) {
	w := NewWorker(nil) // Calling the collector for these old slots would panic.
	w.now = func() time.Time { return time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC) }
	for _, target := range Targets() {
		for days := 1; days <= 30; days++ {
			args := JobArgs(target, w.now().AddDate(0, 0, -days))
			if err := w.Work(t.Context(), &river.Job[CollectArgs]{Args: args}); err != nil {
				t.Fatal(err)
			}
		}
	}
}
