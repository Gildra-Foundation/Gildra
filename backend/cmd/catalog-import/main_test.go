package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/battlenet"
)

func TestSearchResultID(t *testing.T) {
	t.Parallel()
	id, err := searchResultID(json.RawMessage(`{"id":19019}`))
	if err != nil {
		t.Fatal(err)
	}
	if id != 19019 {
		t.Fatalf("id = %d", id)
	}
}

func TestIndexResultIDsReadsExpectedFieldAndDeduplicates(t *testing.T) {
	t.Parallel()
	ids, err := indexResultIDs(json.RawMessage(`{
		"character_specializations":[{"id":62},{"id":63},{"id":62}],
		"pet_specializations":[{"id":74}]
	}`), "character_specializations")
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != 62 || ids[1] != 63 {
		t.Fatalf("ids = %v", ids)
	}
}

func TestIndexResultIDsRejectsUnexpectedDocument(t *testing.T) {
	t.Parallel()
	_, err := indexResultIDs(json.RawMessage(`{"other":[]}`), "quests")
	if err == nil {
		t.Fatal("expected missing index field error")
	}
}

func TestIndexResultEntriesPreservesBuildPinnedLink(t *testing.T) {
	t.Parallel()
	entries, err := indexResultEntries(json.RawMessage(`{
		"talents":[{"id":47503,"key":{"href":"https://us.api.blizzard.com/data/wow/talent/47503?namespace=static-12.1.0_68914-us"}}]
	}`), "talents")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].ID != 47503 || entries[0].Href == "" {
		t.Fatalf("entries = %#v", entries)
	}
}

func TestNormalizeBattleNetQuestUsesOfficialTitleAsName(t *testing.T) {
	t.Parallel()
	payload, err := normalizeBattleNetPayload("quest", json.RawMessage(`{
		"id":8446,"title":"Shrouded in Nightmare","description":"An official description"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		t.Fatal(err)
	}
	if document["name"] != "Shrouded in Nightmare" || document["description"] != "An official description" {
		t.Fatalf("document = %#v", document)
	}
}

func TestParseBattleNetQuestRewards(t *testing.T) {
	t.Parallel()
	rewards, err := parseBattleNetQuestRewards(json.RawMessage(`{
		"rewards":{
			"experience":6200,
			"money":{"value":140450,"units":{"gold":14,"silver":4,"copper":50}},
			"currency":[{"reward":{"key":{"href":"https://us.api.blizzard.com/data/wow/currency/2245"},"name":"Flightstones","id":2245},"value":5}],
			"reputations":[{"reward":{"name":"Cenarion Circle","id":609},"value":500}],
			"spell":{"name":"Warband Bank","id":465226},
			"items":{"items":[{"item":{"name":"Guaranteed","id":100},"quantity":2}],"choice_of":[
				{"item":{"key":{"href":"https://us.api.blizzard.com/data/wow/item/200"},"name":"Choice A","id":200},"requirements":{"playable_specializations":[{"id":62}]}},
				{"item":{"name":"Choice B","id":201}}
			]}
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(rewards) != 8 {
		t.Fatalf("reward count = %d, want 8: %#v", len(rewards), rewards)
	}
	wantTypes := []string{"experience", "money", "currency", "reputation", "spell", "item", "item", "item"}
	for index, reward := range rewards {
		if reward.Type != wantTypes[index] {
			t.Fatalf("reward %d type = %q, want %q", index, reward.Type, wantTypes[index])
		}
	}
	if rewards[5].Amount != 2 || rewards[5].Choice || rewards[5].Index != 0 {
		t.Fatalf("guaranteed item = %#v", rewards[5])
	}
	if !rewards[6].Choice || rewards[6].Index != 1 || rewards[6].Name != "Choice A" {
		t.Fatalf("choice item = %#v", rewards[6])
	}
	if _, ok := rewards[6].Attributes["requirements"]; !ok {
		t.Fatalf("choice requirements were not retained: %#v", rewards[6].Attributes)
	}
}

func TestParseBattleNetQuestRewardsRejectsInvalidJSON(t *testing.T) {
	t.Parallel()
	if _, err := parseBattleNetQuestRewards(json.RawMessage(`{"rewards":`)); err == nil {
		t.Fatal("expected malformed reward document error")
	}
}

func TestNormalizeBattleNetTalentUsesSpellAndRankDescription(t *testing.T) {
	t.Parallel()
	payload, err := normalizeBattleNetPayload("talent", json.RawMessage(`{
		"id":47503,"spell":{"id":123,"name":"Official talent"},
		"rank_descriptions":[{"rank":1,"description":"Official rank text"}]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(payload, &document); err != nil {
		t.Fatal(err)
	}
	if document["name"] != "Official talent" || document["description"] != "Official rank text" {
		t.Fatalf("document = %#v", document)
	}
}

func TestLocalizedTextForLocaleDoesNotPublishAnotherLocale(t *testing.T) {
	t.Parallel()
	value := map[string]any{"en_US": "Longbow", "ru_RU": ""}
	if got := localizedTextForLocale(value, "ru_RU"); got != "" {
		t.Fatalf("ru_RU text = %q", got)
	}
	if got := localizedTextForLocale(value, "en_US"); got != "Longbow" {
		t.Fatalf("en_US text = %q", got)
	}
}

type trackingDetailFetcher struct {
	active    atomic.Int64
	maxActive atomic.Int64
}

func (f *trackingDetailFetcher) FetchLink(
	ctx context.Context, _, _, href string,
) (json.RawMessage, string, error) {
	active := f.active.Add(1)
	defer f.active.Add(-1)
	for {
		maximum := f.maxActive.Load()
		if active <= maximum || f.maxActive.CompareAndSwap(maximum, active) {
			break
		}
	}
	select {
	case <-ctx.Done():
		return nil, "", ctx.Err()
	case <-time.After(10 * time.Millisecond):
		return json.RawMessage(`{"name":"Official spell"}`), href, nil
	}
}

func TestFetchBattleNetSearchDetailsIsBoundedAndOrdered(t *testing.T) {
	t.Parallel()
	results := make([]battlenet.SearchResult, 12)
	for i := range results {
		id := i + 1
		results[i] = battlenet.SearchResult{
			Key:  battlenet.ResourceKey{Href: fmt.Sprintf("https://example.test/spell/%d", id)},
			Data: json.RawMessage(fmt.Sprintf(`{"id":%d}`, id)),
		}
	}
	fetcher := &trackingDetailFetcher{}
	details, err := fetchBattleNetSearchDetails(context.Background(), fetcher, "us", "en_US", results, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(details) != len(results) {
		t.Fatalf("detail count = %d", len(details))
	}
	for i, detail := range details {
		if detail.ID != int64(i+1) {
			t.Fatalf("detail %d ID = %d", i, detail.ID)
		}
	}
	if maximum := fetcher.maxActive.Load(); maximum < 2 || maximum > 3 {
		t.Fatalf("maximum concurrent fetches = %d", maximum)
	}
}

func TestFetchBattleNetIndexDetailsPreservesQuestIDs(t *testing.T) {
	t.Parallel()
	entries := []battleNetIndexEntry{
		{ID: 8446, Href: "https://example.test/quest/8446"},
		{ID: 8447, Href: "https://example.test/quest/8447"},
	}
	details, err := fetchBattleNetIndexDetails(context.Background(), &trackingDetailFetcher{}, "us", "en_US", entries, 2)
	if err != nil {
		t.Fatal(err)
	}
	for i, detail := range details {
		if detail.ID != entries[i].ID || detail.SourceURL != entries[i].Href {
			t.Fatalf("detail %d = %#v", i, detail)
		}
	}
}

func TestBattleNetMediaHref(t *testing.T) {
	t.Parallel()
	href := battleNetMediaHref(json.RawMessage(`{
		"media":{"key":{"href":"https://us.api.blizzard.com/data/wow/media/playable-class/1?namespace=static-12.1.0_68914-us"}}
	}`))
	if href != "https://us.api.blizzard.com/data/wow/media/playable-class/1?namespace=static-12.1.0_68914-us" {
		t.Fatalf("href = %q", href)
	}
}

func TestBattleNetMediaIconNameUsesOnlyOfficialIconAsset(t *testing.T) {
	t.Parallel()
	payload := json.RawMessage(`{"assets":[
		{"key":"tile","value":"https://render.worldofwarcraft.com/us/zones/example-small.jpg"},
		{"key":"icon","value":"https://render.worldofwarcraft.com/us/icons/56/626008.jpg"}
	]}`)
	if got := battleNetMediaIconName(payload); got != "626008" {
		t.Fatalf("icon name = %q", got)
	}
}

func TestBattleNetMediaIconNameRejectsThirdPartyAsset(t *testing.T) {
	t.Parallel()
	payload := json.RawMessage(`{"assets":[{"key":"icon","value":"https://example.test/icons/fake.jpg"}]}`)
	if got := battleNetMediaIconName(payload); got != "" {
		t.Fatalf("icon name = %q", got)
	}
}

func TestBattleNetMediaAssetsPreservesOfficialImages(t *testing.T) {
	t.Parallel()
	payload := json.RawMessage(`{"assets":[
		{"key":"icon","value":"https://render.worldofwarcraft.com/us/icons/56/inv_sword_04.jpg","file_data_id":134328,"width":56,"height":56},
		{"key":"main-raw","value":"https://render.worldofwarcraft.com/us/npcs/zoom/creature-display-1.webp"},
		{"key":"tracking","value":"https://example.test/pixel.gif"}
	]}`)
	assets := battleNetMediaAssets(payload)
	if len(assets) != 2 {
		t.Fatalf("asset count = %d, want 2: %#v", len(assets), assets)
	}
	if assets[0].Kind != "icon" || assets[0].MIMEType != "image/jpeg" ||
		assets[0].FileDataID == nil || *assets[0].FileDataID != 134328 ||
		assets[0].Width == nil || *assets[0].Width != 56 || !assets[0].Primary {
		t.Fatalf("icon asset = %#v", assets[0])
	}
	if assets[1].Kind != "main_raw" || assets[1].MIMEType != "image/webp" || assets[1].Primary {
		t.Fatalf("render asset = %#v", assets[1])
	}
}

func TestBattleNetMediaAssetsRejectsInvalidKeysAndHosts(t *testing.T) {
	t.Parallel()
	payload := json.RawMessage(`{"assets":[
		{"key":"1","value":"https://render.worldofwarcraft.com/us/icon.jpg"},
		{"key":"icon","value":"http://render.worldofwarcraft.com/us/icon.jpg"},
		{"key":"icon","value":"https://worldofwarcraft.com.example.test/icon.jpg"}
	]}`)
	if assets := battleNetMediaAssets(payload); len(assets) != 0 {
		t.Fatalf("unexpected assets: %#v", assets)
	}
}

func TestWagoRecordRejectsUnnamedTechnicalRowsWithSkippableError(t *testing.T) {
	t.Parallel()
	_, err := wagoRecord("spell", "en_US", "https://example.test/spell.csv", map[string]string{
		"ID": "230508", "Name_lang": "",
	})
	if !errors.Is(err, errWagoRecordMissingName) {
		t.Fatalf("expected skippable missing-name error, got %v", err)
	}
}

func TestRegionForLocale(t *testing.T) {
	t.Parallel()
	tests := map[string]string{"en_US": "us", "ru_RU": "eu"}
	for locale, want := range tests {
		got, err := regionForLocale(locale)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("regionForLocale(%q) = %q", locale, got)
		}
	}
}

func TestBuildNumber(t *testing.T) {
	t.Parallel()
	got, err := buildNumber("12.1.0.69404")
	if err != nil {
		t.Fatal(err)
	}
	if got != 69404 {
		t.Fatalf("build number = %d", got)
	}
}

func TestWagoRecord(t *testing.T) {
	t.Parallel()
	record, err := wagoRecord("item", "en_US", "https://example.test/item.csv", map[string]string{
		"ID": "19019", "Display_lang": "Thunderfury", "Description_lang": "A blade",
		"ItemLevel": "80", "RequiredLevel": "60", "InventoryType": "13", "Stackable": "1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if record.ExternalID != 19019 || record.Type != "item" {
		t.Fatalf("record = %+v", record)
	}
}

func TestWagoSpellRecordIncludesLocalizedText(t *testing.T) {
	t.Parallel()
	record, err := wagoRecordWithSpellText("spell", "ru_RU", "https://example.test/spell.csv", map[string]string{
		"ID": "133", "Name_lang": "Огненный шар",
	}, map[int64]spellText{133: {
		Subtext: "Маг", Description: "Бросает огненный шар.", AuraDescription: "Горит.",
	}})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(record.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["description"] != "Бросает огненный шар." || payload["subtext"] != "Маг" {
		t.Fatalf("payload = %#v", payload)
	}
}
