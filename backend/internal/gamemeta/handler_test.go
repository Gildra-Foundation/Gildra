package gamemeta

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeStore struct {
	snapshot Snapshot
	meta     MythicPlusMeta
	err      error
	query    Query
	locale   string
}

func (f *fakeStore) WoWMythicPlusMeta(_ context.Context) (MythicPlusMeta, error) {
	return f.meta, f.err
}

func (f *fakeStore) WoWTierList(_ context.Context, query Query) (Snapshot, error) {
	f.query = query
	return f.snapshot, f.err
}

func (f *fakeStore) WoWTierListContexts(_ context.Context, _, locale string) ([]Context, error) {
	f.locale = locale
	return []Context{{Activity: "mythic_plus", SelectionType: "all", SelectionID: "all", SelectionName: "All dungeons", AddonKey: "midnight", AddonName: "Midnight"}}, f.err
}

func TestWoWTierListReturnsPublicSnapshot(t *testing.T) {
	store := &fakeStore{snapshot: Snapshot{Game: "wow", Status: "live", UpdatedAt: time.Now(), Entries: []Entry{{Rank: 1, Tier: "S", SpecName: "Demonology"}}}}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list?role=healer&limit=7", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if store.query.Activity != "mythic_plus" || store.query.Role != "healer" || store.query.Limit != 7 {
		t.Fatalf("query = %#v", store.query)
	}
	if response.Header().Get("Cache-Control") == "" {
		t.Fatal("public response is missing Cache-Control")
	}
}

func TestWoWTierListRejectsInvalidFilters(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	for _, target := range []string{
		"/v1/meta/wow/tier-list?activity=pvp",
		"/v1/meta/wow/tier-list?role=all",
		"/v1/meta/wow/tier-list?limit=1000",
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want %d", target, response.Code, http.StatusBadRequest)
		}
	}
}

func TestWoWTierListMapsUnavailableStates(t *testing.T) {
	for _, test := range []struct {
		err  error
		want int
	}{{ErrSnapshotNotFound, http.StatusNotFound}, {errors.New("database unavailable"), http.StatusServiceUnavailable}} {
		mux := http.NewServeMux()
		NewHandler(&fakeStore{err: test.err}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list", nil))
		if response.Code != test.want {
			t.Fatalf("status = %d, want %d", response.Code, test.want)
		}
	}
}

func TestWoWTierListAcceptsSpecificContext(t *testing.T) {
	store := &fakeStore{snapshot: Snapshot{Game: "wow", Status: "live", Entries: []Entry{{Rank: 1, Tier: "S", SpecName: "Demonology"}}}}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list?activity=raid&role=dps&selectionType=raid&selectionId=1307&difficulty=raid_myth", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if store.query.SelectionType != "raid" || store.query.SelectionID != "1307" || store.query.Difficulty != "raid_myth" {
		t.Fatalf("query = %#v", store.query)
	}
}

func TestWoWTierListContexts(t *testing.T) {
	for _, test := range []struct{ query, locale string }{{"", SourceLocale}, {"&locale=ru_RU", SourceLocale}, {"&locale=en_US", "en_US"}} {
		store := &fakeStore{}
		mux := http.NewServeMux()
		NewHandler(store).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list/contexts?activity=mythic_plus"+test.query, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%q: status = %d, want %d", test.query, response.Code, http.StatusOK)
		}
		if store.locale != test.locale {
			t.Fatalf("%q: locale = %q, want %q", test.query, store.locale, test.locale)
		}
	}
}

func TestWoWTierListContextsRejectsUnknownLocales(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/tier-list/contexts?locale=de_DE", nil))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestLocalizeContextsRenamesKnownJournalNames(t *testing.T) {
	contexts := []Context{
		{SelectionType: "all", SelectionName: "Все подземелья"},
		{SelectionType: "dungeon", SelectionName: "Закоулок душегубов"},
		{SelectionType: "raid", SelectionName: "Отравленная бездна"},
		{SelectionType: "boss", SelectionName: "Ссзорак"},
		{SelectionType: "boss", SelectionName: "Кит'икс"},
		// A boss that shares a dungeon's name must not take the dungeon's translation.
		{SelectionType: "boss", SelectionName: "Закоулок душегубов"},
	}
	names := map[journalName]string{
		{kind: "instance", ru: "Закоулок душегубов"}: "Murder Row",
		{kind: "instance", ru: "Отравленная бездна"}: "The Venomous Abyss",
		{kind: "encounter", ru: "Ссзорак"}:           "Sszorak",
	}
	got := localizeContexts(contexts, names)
	want := []string{"Все подземелья", "Murder Row", "The Venomous Abyss", "Sszorak", "Кит'икс", "Закоулок душегубов"}
	for index, item := range got {
		if item.SelectionName != want[index] {
			t.Fatalf("context %d = %q, want %q", index, item.SelectionName, want[index])
		}
	}
	if contexts[1].SelectionName != "Закоулок душегубов" {
		t.Fatal("localizeContexts changed its input")
	}
}

func TestWoWMythicPlusMetaServesTheStoredPayload(t *testing.T) {
	store := &fakeStore{meta: MythicPlusMeta{Game: "wow", Status: "live", Data: []byte(`{"schema_version":1,"seasons":[]}`)}}
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/meta", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if body := response.Body.String(); !strings.Contains(body, `"data":{"schema_version":1,"seasons":[]}`) {
		t.Fatalf("body = %s", body)
	}
	if response.Header().Get("Cache-Control") != publicMetaCache {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestWoWMythicPlusMetaMapsMissingAndFailingSnapshots(t *testing.T) {
	for _, test := range []struct {
		err  error
		want int
	}{{ErrSnapshotNotFound, http.StatusNotFound}, {errors.New("database down"), http.StatusServiceUnavailable}} {
		mux := http.NewServeMux()
		NewHandler(&fakeStore{err: test.err}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/meta", nil))
		if response.Code != test.want {
			t.Fatalf("%v: status = %d, want %d", test.err, response.Code, test.want)
		}
	}
}

func TestMythicPlusMetaTurnsStaleAfterMissedRefreshes(t *testing.T) {
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	fresh, old := now.Add(-7*time.Hour), now.Add(-37*time.Hour)
	if got := mythicPlusMetaStatus(&fresh, now); got != "live" {
		t.Fatalf("fresh status = %q", got)
	}
	if got := mythicPlusMetaStatus(&old, now); got != "stale" {
		t.Fatalf("old status = %q", got)
	}
	if got := mythicPlusMetaStatus(nil, now); got != "stale" {
		t.Fatalf("unchecked status = %q", got)
	}
}

func TestWoWTierListAcceptsSourceTabs(t *testing.T) {
	for _, test := range []struct{ target, source, difficulty string }{
		{"/v1/meta/wow/tier-list?source=ugg&activity=raid&difficulty=mythic", SourceUgg, "mythic"},
		{"/v1/meta/wow/tier-list?source=ugg&activity=raid", SourceUgg, ""},
		{"/v1/meta/wow/tier-list?source=mythicstats&role=tank", SourceMythicStats, ""},
	} {
		store := &fakeStore{snapshot: Snapshot{Game: "wow", Status: "live", Entries: []Entry{{Rank: 1, Tier: "S"}}}}
		mux := http.NewServeMux()
		NewHandler(store).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.target, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, want %d", test.target, response.Code, http.StatusOK)
		}
		if store.query.Source != test.source || store.query.Difficulty != test.difficulty {
			t.Fatalf("%s: query = %#v", test.target, store.query)
		}
	}
}

func TestUggDifficultyDefaultsToTheSourcePageView(t *testing.T) {
	for _, test := range []struct{ activity, difficulty, want string }{
		{"raid", "", "heroic"}, {"raid", "raid_myth", "mythic"}, {"raid", "all", "all"},
		{"mythic_plus", "", "all"},
	} {
		if got, ok := uggDifficulty(test.activity, test.difficulty); !ok || got != test.want {
			t.Fatalf("uggDifficulty(%q, %q) = %q, %v", test.activity, test.difficulty, got, ok)
		}
	}
}
