package main

import (
	"encoding/json"
	"testing"
)

func TestRaidbotsRecord(t *testing.T) {
	t.Parallel()
	record, include, err := raidbotsRecord("https://example.test/items.json", datasetSpecs["equippable-items-full.json"], json.RawMessage(`{
		"id":25,"name":"Worn Shortsword","quality":1,"itemClass":2,"itemSubClass":7,"inventoryType":21,"itemLevel":1
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if !include || record.ExternalID != 25 || record.Type != "item" || record.Locale != "en_US" {
		t.Fatalf("record=%+v include=%v", record, include)
	}
}

func TestRaidbotsTalentTreeName(t *testing.T) {
	t.Parallel()
	record, include, err := raidbotsRecord("https://example.test/talents.json", datasetSpecs["talents.json"], json.RawMessage(`{
		"traitTreeId":793,"className":"Druid","specId":102,"specName":"Balance"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if !include || record.ExternalID != 102 {
		t.Fatalf("record=%+v include=%v", record, include)
	}
	var payload map[string]any
	if err := json.Unmarshal(record.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["name"] != "Druid — Balance" {
		t.Fatalf("name = %q", payload["name"])
	}
}

func TestCollectTalentFactsAggregatesAppearances(t *testing.T) {
	t.Parallel()
	talents := make(map[int64]*talentFact)
	for _, raw := range []string{
		`{"traitTreeId":793,"classId":11,"className":"Druid","specId":102,"specName":"Balance","classNodes":[{"id":82199,"posX":1,"posY":2,"entries":[{"id":103277,"name":"Rake","spellId":1822,"icon":"ability_druid_disembowel"}]}]}`,
		`{"traitTreeId":793,"classId":11,"className":"Druid","specId":103,"specName":"Feral","classNodes":[{"id":82199,"posX":1,"posY":2,"entries":[{"id":103277,"name":"Rake","spellId":1822,"icon":"ability_druid_disembowel"}]}]}`,
	} {
		if err := collectTalentFacts(json.RawMessage(raw), talents); err != nil {
			t.Fatal(err)
		}
	}
	fact := talents[103277]
	if fact == nil || len(fact.appearances) != 2 {
		t.Fatalf("fact=%+v", fact)
	}
	if fact.entry["spellId"] != float64(1822) {
		t.Fatalf("entry=%+v", fact.entry)
	}
}
