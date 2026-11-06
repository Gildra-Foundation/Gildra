package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// leaderboardFixture: 620 characters, score 4000 down by 1 point. Every fifth
// one is a Blood DK tank (250), every seventh a Holy Paladin healer (65), the
// rest Fire Mages (63). Realms alternate between Silvermoon and Гордунни.
func leaderboardFixture(t *testing.T) []byte {
	t.Helper()
	characters := make([]map[string]any, 0, 620)
	for index := 0; index < 620; index++ {
		spec, hero := 63, 39
		switch {
		case index%5 == 0:
			spec, hero = 250, 31
		case index%7 == 0:
			spec, hero = 65, 49
		}
		realm := "silvermoon"
		if index%2 == 1 {
			realm = "gordunni"
		}
		name := fmt.Sprintf("Player%03d", index)
		if index == 3 {
			name = "Émptinêss"
		}
		characters = append(characters, map[string]any{
			"name": name, "realm": realm, "spec": spec, "hero": hero, "score": 4000 - float64(index),
			"key": 20, "ilvl": 340, "faction": "h", "loadout": "CoPAkXBWxkyfx9CbGaHonEAhLxMzyMzwMm",
		})
	}
	payload := map[string]any{
		"schema_version": 1, "region": "eu", "period": 1088,
		"season": map[string]any{"id": 18, "name": "Midnight Season 2"},
		"realms": map[string]any{"silvermoon": map[string]any{"en": "Silvermoon"}, "gordunni": map[string]any{"en": "Gordunni", "ru": "Гордунни"}},
		"items":  map[string]any{"270173": map[string]any{"name": map[string]any{"en": "Guillotine", "ru": "Гильотина"}, "quality": "epic", "icon": "inv_trinket"}},
		"specs": []map[string]any{
			{"id": 250, "class_id": 6, "role": "tank", "count": 100, "top_score": 4000, "gear_sample": 30,
				"hero":     []map[string]any{{"id": 31, "name": "San'layn", "count": 100, "share": 1, "top": map[string]any{"name": "Player000", "realm": "silvermoon", "score": 4000, "loadout": "CoPAkXBWxkyfx9CbGaHonEAhLxMzyMzwMm"}}},
				"trinkets": []map[string]any{{"id": 270173, "count": 21, "share": 0.7}, {"id": 999, "count": 3, "share": 0.1}},
				"weapons":  []map[string]any{}},
			{"id": 65, "class_id": 2, "role": "healer", "count": 74, "hero": []any{}, "trinkets": []any{}, "weapons": []any{}},
			{"id": 63, "class_id": 8, "role": "dps", "count": 100, "hero": []any{}, "trinkets": []any{}, "weapons": []any{}},
		},
		"characters": characters,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func parsedFixture(t *testing.T) *LeaderboardSnapshot {
	t.Helper()
	snapshot, err := ParseLeaderboardSnapshot(leaderboardFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestLeaderboardOverallIsTop500ByRating(t *testing.T) {
	page := parsedFixture(t).Query(LeaderboardQuery{Region: "eu", Page: 2, PageSize: 50})
	if page.Depth != 500 || page.Total != 500 || page.Pages != 10 {
		t.Fatalf("depth/total/pages = %d/%d/%d", page.Depth, page.Total, page.Pages)
	}
	if first := page.Entries[0]; first.Rank != 51 || first.Score != 3950 || first.Name != "Player050" {
		t.Fatalf("first entry of page 2 = %+v", first)
	}
	if len(page.Leaders["tank"]) != LeaderboardLeaders || page.Leaders["healer"][0].Name != "Player007" || page.Leaders["dps"][0].Name != "Player001" {
		t.Fatalf("leaders = %+v", page.Leaders)
	}
	if page.Summary != nil {
		t.Fatal("overall view must not carry a spec summary")
	}
}

func TestLeaderboardFilteredViewsRankWithinTheViewTo100(t *testing.T) {
	snapshot := parsedFixture(t)
	tanks := snapshot.Query(LeaderboardQuery{Region: "eu", Role: "tank", PageSize: 100})
	if tanks.Depth != 100 || tanks.Entries[0].Rank != 1 || tanks.Entries[1].Name != "Player005" || tanks.Entries[99].Rank != 100 {
		t.Fatalf("tank view: depth %d, entries %+v", tanks.Depth, tanks.Entries[:2])
	}
	paladins := snapshot.Query(LeaderboardQuery{Region: "eu", ClassID: 2})
	if tanks.Entries[0].HeroName != "San'layn" {
		t.Fatalf("hero name = %q", tanks.Entries[0].HeroName)
	}
	if paladins.Depth == 0 || paladins.Entries[0].SpecID != 65 || paladins.Entries[0].ClassID != 2 {
		t.Fatalf("class view = %+v", paladins.Entries[0])
	}
	spec := snapshot.Query(LeaderboardQuery{Region: "eu", SpecID: 250})
	if spec.Summary == nil || spec.Summary.Heroes[0].Top == nil || spec.Summary.Heroes[0].Top.Realm.Name != "Silvermoon" {
		t.Fatalf("spec summary = %+v", spec.Summary)
	}
	if len(spec.Summary.Trinkets) != 1 || spec.Summary.Trinkets[0].NameRU != "Гильотина" {
		t.Fatalf("unknown items must be dropped, got %+v", spec.Summary.Trinkets)
	}
}

func TestLeaderboardRealmAndSearchNarrowWithoutRenumbering(t *testing.T) {
	snapshot := parsedFixture(t)
	page := snapshot.Query(LeaderboardQuery{Region: "eu", Realm: "gordunni", PageSize: 10})
	if page.Total != 250 || page.Entries[0].Rank != 2 || page.Entries[0].Realm.NameRU != "Гордунни" {
		t.Fatalf("realm filter: total %d first %+v", page.Total, page.Entries[0])
	}
	if len(page.Realms) != 2 || page.Realms[0].Slug != "gordunni" || page.Realms[0].Count != 250 {
		t.Fatalf("realm options = %+v", page.Realms)
	}
	found := snapshot.Query(LeaderboardQuery{Region: "eu", Search: "emptiness"})
	if found.Total != 1 || found.Entries[0].Rank != 4 {
		t.Fatalf("accent-insensitive search = %+v", found.Entries)
	}
	byRealm := snapshot.Query(LeaderboardQuery{Region: "eu", Search: "гордун"})
	if byRealm.Total != 250 {
		t.Fatalf("search by localized realm name = %d", byRealm.Total)
	}
	empty := snapshot.Query(LeaderboardQuery{Region: "eu", Search: "nobody"})
	if empty.Total != 0 || empty.Pages != 0 || empty.Entries == nil {
		t.Fatalf("empty result = %+v", empty)
	}
}

func TestParseLeaderboardRejectsForeignPayloads(t *testing.T) {
	for _, raw := range []string{`{}`, `{"schema_version":1,"region":"cn"}`, `{"schema_version":1,"region":"eu","specs":[{"id":1,"role":"support"}]}`, `not json`} {
		if _, err := ParseLeaderboardSnapshot([]byte(raw)); err == nil {
			t.Fatalf("%s: expected an error", raw)
		}
	}
}

func TestLeaderboardStatus(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	recent, old := now.Add(-13*time.Hour), now.Add(-49*time.Hour)
	if leaderboardStatus(&recent, now) != "live" || leaderboardStatus(&old, now) != "stale" || leaderboardStatus(nil, now) != "stale" {
		t.Fatal("unexpected leaderboard status")
	}
}

type fakeLeaderboardStore struct {
	snapshot *LeaderboardSnapshot
	err      error
	region   string
}

func (f *fakeLeaderboardStore) WoWMythicPlusLeaderboard(_ context.Context, region string) (*LeaderboardSnapshot, error) {
	f.region = region
	return f.snapshot, f.err
}

func TestLeaderboardHandler(t *testing.T) {
	store := &fakeLeaderboardStore{snapshot: parsedFixture(t)}
	mux := http.NewServeMux()
	NewLeaderboardHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/leaderboard?spec=250&limit=20&q=player", nil))
	if response.Code != http.StatusOK || store.region != "eu" || response.Header().Get("Cache-Control") == "" {
		t.Fatalf("status %d, region %q", response.Code, store.region)
	}
	var page LeaderboardPage
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.PageSize != 20 || len(page.Entries) != 20 || page.Summary == nil || page.View.Search != "player" {
		t.Fatalf("page = %+v", page)
	}

	for _, target := range []string{
		"?region=cn", "?role=support", "?class=99", "?spec=abc", "?realm=Bad%20Realm", "?realm=a/b", "?page=0", "?page=101", "?limit=1000",
		"?q=" + strings.Repeat("a", 41),
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/leaderboard"+target, nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", target, response.Code)
		}
	}

	for _, test := range []struct {
		err  error
		want int
	}{{ErrSnapshotNotFound, http.StatusNotFound}, {errors.New("database unavailable"), http.StatusServiceUnavailable}} {
		mux := http.NewServeMux()
		NewLeaderboardHandler(&fakeLeaderboardStore{err: test.err}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/leaderboard?region=us", nil))
		if response.Code != test.want {
			t.Fatalf("status = %d, want %d", response.Code, test.want)
		}
	}
}
