package main

import "testing"

func TestParseTooltipExtractsVerifiedItemValues(t *testing.T) {
	raw := `<!--ilvl-->10 <!--dmg-->4 - 9 <!--spd-->3.60 <!--dps-->(1.8 damage per second)
		<!--stat3-->+2 Agility <!--stat7-->+4 Stamina Durability: 80 / 80
		<span class="whtt-droppedby">Dropped by: Admiral Ripsnarl</span>
		<span class="whtt-dropchance">Drop chance: 14.92%</span>`
	parsed := parseTooltip(raw)
	if parsed.itemLevel == nil || *parsed.itemLevel != 10 || parsed.damageMin == nil || *parsed.damageMin != 4 || parsed.damageMax == nil || *parsed.damageMax != 9 {
		t.Fatalf("unexpected item values: %#v", parsed)
	}
	if len(parsed.stats) != 2 || parsed.dropName != "Admiral Ripsnarl" || parsed.dropChance == nil || *parsed.dropChance != 14.92 {
		t.Fatalf("unexpected stats or acquisition: %#v", parsed)
	}
}

func TestDescriptionPatternExtractsRenderedSpellText(t *testing.T) {
	raw := `<div class="q">&quot;Spellsteal&quot; triggers again after 4 sec.</div>`
	match := descriptionPattern.FindStringSubmatch(raw)
	if len(match) != 2 || cleanText(match[1]) != `"Spellsteal" triggers again after 4 sec.` {
		t.Fatalf("unexpected rendered description: %#v", match)
	}
}
