package gamemeta

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func (f *fakeStore) WoWTierListCompare(_ context.Context, query Query) (Comparison, error) {
	f.query = query
	return Comparison{Game: "wow", Activity: query.Activity, Role: query.Role, Bracket: query.Bracket}, f.err
}

func (f *fakeStore) WoWTierListSources(_ context.Context) ([]SourceAvailability, error) {
	return []SourceAvailability{{TierSource: tierSources[0], Status: "live"}}, f.err
}

func serve(t *testing.T, store *fakeStore, target string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
	return response
}

func TestPvPTierListDefaultsToThreeVsThree(t *testing.T) {
	store := &fakeStore{snapshot: Snapshot{Game: "wow"}}
	if response := serve(t, store, "/v1/meta/wow/tier-list?activity=pvp&source=murlok"); response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if store.query.Bracket != "3v3" || store.query.Source != SourceMurlok {
		t.Fatalf("query = %#v", store.query)
	}
	if response := serve(t, store, "/v1/meta/wow/tier-list?activity=pvp&bracket=shuffle&region=eu&source=ladder"); response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if store.query.Bracket != "shuffle" || store.query.Region != "eu" {
		t.Fatalf("query = %#v", store.query)
	}
}

func TestEverySourceTabIsAcceptedForItsModes(t *testing.T) {
	for _, source := range tierSources {
		for _, activity := range source.Activities {
			response := serve(t, &fakeStore{}, "/v1/meta/wow/tier-list?source="+source.ID+"&activity="+activity)
			if response.Code != http.StatusOK {
				t.Fatalf("%s/%s: status = %d", source.ID, activity, response.Code)
			}
		}
	}
}

func TestCompareAndSourcesEndpoints(t *testing.T) {
	store := &fakeStore{}
	response := serve(t, store, "/v1/meta/wow/tier-list/compare?activity=pvp&role=healer&bracket=2v2")
	if response.Code != http.StatusOK || store.query.Role != "healer" || store.query.Bracket != "2v2" {
		t.Fatalf("compare: status = %d query = %#v", response.Code, store.query)
	}
	if response := serve(t, store, "/v1/meta/wow/tier-list/compare?activity=mythic_plus&difficulty=raid_hero"); response.Code != http.StatusBadRequest {
		t.Fatalf("compare with a raid difficulty on Mythic+: status = %d", response.Code)
	}
	response = serve(t, store, "/v1/meta/wow/tier-list/sources")
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"brackets":["3v3","2v2","shuffle","blitz","rbg"]`) {
		t.Fatalf("sources: status = %d body = %s", response.Code, response.Body.String())
	}
}

func TestTierValueOrdersEverySourceScale(t *testing.T) {
	order := []string{"S+", "S", "A+", "A", "A-", "B", "C", "D", "F"}
	previous := -1.0
	for _, tier := range order {
		value, ok := tierValue(tier)
		if !ok || value <= previous {
			t.Fatalf("%s = %v (previous %v)", tier, value, previous)
		}
		previous = value
	}
	if _, ok := tierValue("X"); ok {
		t.Fatal("unknown tiers must be rejected")
	}
}

func TestConsensusAveragesTiersAndKeepsOrder(t *testing.T) {
	spec := func(class, spec, tier string) Entry {
		return Entry{ClassSlug: class, SpecSlug: spec, ClassName: class, SpecName: spec, Tier: tier}
	}
	score := 3900.0
	wowgg := spec("rogue", "subtlety", "S")
	wowgg.Score = &score
	columns := []SourceColumn{
		{Source: SourceWowhead, Entries: []Entry{spec("warrior", "arms", "S"), spec("rogue", "subtlety", "A"), spec("mage", "fire", "C")}},
		{Source: SourceWowGG, Entries: []Entry{wowgg, spec("warrior", "arms", "A+"), spec("mage", "fire", "B")}},
		{Source: SourceMethod, Entries: []Entry{spec("warrior", "arms", "S"), spec("hunter", "survival", "D")}},
	}
	got := Consensus(columns, "dps")
	if len(got) != 4 {
		t.Fatalf("entries = %d", len(got))
	}
	want := []string{"arms:S:3", "subtlety:A:2", "fire:C:2", "survival:D:1"}
	for index, entry := range got {
		key := entry.SpecSlug + ":" + entry.Tier + ":" + string(rune('0'+entry.Sources))
		if key != want[index] || entry.Rank != index+1 {
			t.Fatalf("#%d = %s (rank %d), want %s", index+1, key, entry.Rank, want[index])
		}
	}
	if got[1].Score == nil || *got[1].Score != score {
		t.Fatal("wow.gg's numbers must ride along on the consensus row")
	}
}

func TestPayloadListMatchesBracketAndRegion(t *testing.T) {
	raw := []byte(`{"schema_version":1,"source":"ladder","lists":[
	 {"activity":"pvp","role":"dps","bracket":"3v3","region":"all","source_url":"https://x","tiers_derived":true,
	  "entries":[{"rank":1,"tier":"S","class_slug":"rogue","spec_slug":"subtlety","class_name":"Rogue","spec_name":"Subtlety",
	  "metrics":{"popularity":0.2,"players":120,"rating":2650.5,"win_rate":0.56}}]},
	 {"activity":"pvp","role":"dps","bracket":"3v3","region":"eu","source_url":"https://x","entries":[]},
	 {"activity":"mythic_plus","role":"dps","bracket":"","region":"","source_url":"https://y",
	  "entries":[{"rank":1,"tier":"A","class_slug":"mage","spec_slug":"fire","metrics":{"max_key":21}}]}]}`)
	doc, err := parsePayloadDoc(raw)
	if err != nil {
		t.Fatal(err)
	}
	list := doc.findList(Query{Activity: "pvp", Role: "dps", Bracket: "3v3", Region: "us"})
	if list == nil || list.Region != "all" {
		t.Fatalf("missing region must fall back to all: %#v", list)
	}
	entries := list.entries(40)
	if len(entries) != 1 || *entries[0].Players != 120 || *entries[0].WinRate != 0.56 || *entries[0].Rating != 2650.5 {
		encoded, _ := json.Marshal(entries)
		t.Fatalf("entries = %s", encoded)
	}
	if doc.findList(Query{Activity: "pvp", Role: "dps", Bracket: "2v2"}) != nil {
		t.Fatal("a missing bracket must not match")
	}
	mythic := doc.findList(Query{Activity: "mythic_plus", Role: "dps"}).entries(40)
	if *mythic[0].MaxKey != 21 {
		t.Fatalf("max key = %v", *mythic[0].MaxKey)
	}
	if _, err := parsePayloadDoc([]byte(`{"schema_version":2}`)); err == nil {
		t.Fatal("an unknown schema must be rejected")
	}
}
