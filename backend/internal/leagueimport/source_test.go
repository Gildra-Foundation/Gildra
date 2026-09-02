package leagueimport

import "testing"

func TestBuildSkinsUsesParentArtworkForChromas(t *testing.T) {
	parent := 4
	english := championPayload{ID: "Ahri", Skins: []skinPayload{{ID: "103008", Num: 8, Name: "Amethyst", ParentSkin: &parent}}}
	russian := championPayload{ID: "Ahri", Skins: []skinPayload{{ID: "103008", Num: 8, Name: "Аметист", ParentSkin: &parent}}}
	skins, err := buildSkins(english, russian)
	if err != nil {
		t.Fatal(err)
	}
	if len(skins) != 1 {
		t.Fatalf("skins=%d", len(skins))
	}
	if !contains(skins[0].SplashURL, "Ahri_4.jpg") {
		t.Fatalf("splash=%s", skins[0].SplashURL)
	}
	if skins[0].Localizations[LocaleRussian].Name != "Аметист" {
		t.Fatal("Russian localization was not preserved")
	}
}
func TestSlugify(t *testing.T) {
	if value := slugify("Cho'Gath Prime"); value != "cho-gath-prime" {
		t.Fatalf("slug=%q", value)
	}
}

func TestBuildRuneShardsPreservesLocalizationAndOfficialAsset(t *testing.T) {
	english := []clientPerk{{ID: 5008, Name: "Adaptive Force", LongDesc: "+9 Adaptive Force", IconPath: "/lol-game-data/assets/v1/perk-images/StatMods/StatModsAdaptiveForceIcon.png"}}
	russian := []clientPerk{{ID: 5008, Name: "Адаптивная сила", LongDesc: "+9 адаптивной силы", IconPath: "/lol-game-data/assets/v1/perk-images/StatMods/StatModsAdaptiveForceIcon.png"}}
	entries, err := buildRuneShards("16.17.1", english, russian)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries=%d", len(entries))
	}
	entry := entries[0]
	if entry.ExternalKey != "5008" || entry.Category != "runes" || len(entry.Tags) != 1 || entry.Tags[0] != "stat-shard" {
		t.Fatalf("unexpected entry: %#v", entry)
	}
	if !contains(entry.IconURL, "ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png") {
		t.Fatalf("icon=%s", entry.IconURL)
	}
	if entry.Localizations[LocaleRussian].Name != "Адаптивная сила" {
		t.Fatalf("Russian name=%s", entry.Localizations[LocaleRussian].Name)
	}
}

func TestBuildRuneShardsRejectsMissingRussianLocalization(t *testing.T) {
	_, err := buildRuneShards("16.17.1", []clientPerk{{ID: 5008, Name: "Adaptive Force", IconPath: "/StatModsAdaptiveForceIcon.png"}}, nil)
	if err == nil {
		t.Fatal("expected missing localization error")
	}
}

func TestCommunityDataURLUsesMajorMinorBranch(t *testing.T) {
	source := NewSource(nil, 1).WithCommunityBaseURL("https://example.test")
	got := source.communityDataURL("16.17.1", "ru_ru", "perks.json")
	want := "https://example.test/16.17/plugins/rcp-be-lol-game-data/global/ru_ru/v1/perks.json"
	if got != want {
		t.Fatalf("url=%q want=%q", got, want)
	}
}
func contains(value, part string) bool {
	for index := 0; index+len(part) <= len(value); index++ {
		if value[index:index+len(part)] == part {
			return true
		}
	}
	return false
}
