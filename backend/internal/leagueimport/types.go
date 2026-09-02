package leagueimport

import (
	"encoding/json"
	"slices"
)

const (
	LocaleEnglish = "en_US"
	LocaleRussian = "ru_RU"
)

type Localization struct {
	Name        string
	Title       string
	Blurb       string
	Lore        string
	AllyTips    []string
	EnemyTips   []string
	Description string
	Tooltip     string
	Payload     json.RawMessage
}

type MediaRef struct {
	Role string
	URL  string
}

type Ability struct {
	Key           string
	Kind          string
	Slot          string
	DisplayOrder  int16
	Cooldowns     json.RawMessage
	Costs         json.RawMessage
	Ranges        json.RawMessage
	Variables     json.RawMessage
	Effects       json.RawMessage
	Payload       json.RawMessage
	IconURL       string
	Localizations map[string]Localization
}

type Skin struct {
	RiotID        int64
	Number        int
	HasChromas    bool
	Payload       json.RawMessage
	SplashURL     string
	LoadingURL    string
	TileURL       string
	Localizations map[string]Localization
}

type Champion struct {
	RiotKey       int
	Slug          string
	InternalName  string
	ResourceType  string
	Tags          []string
	Info          json.RawMessage
	Stats         json.RawMessage
	Payload       json.RawMessage
	IconURL       string
	SplashURL     string
	LoadingURL    string
	TileURL       string
	Localizations map[string]Localization
	Abilities     []Ability
	Skins         []Skin
}

type StaticEntry struct {
	Category      string
	ExternalKey   string
	Slug          string
	Tags          []string
	IconURL       string
	Payload       json.RawMessage
	Localizations map[string]Localization
}

type Dataset struct {
	Version    string
	Champions  []Champion
	Static     []StaticEntry
	SourceURLs []string
}

type Counts struct {
	Champions         int            `json:"champions"`
	Abilities         int            `json:"abilities"`
	Skins             int            `json:"skins"`
	StaticEntries     int            `json:"staticEntries"`
	ContentByCategory map[string]int `json:"contentByCategory"`
	MediaAssets       int            `json:"mediaAssets"`
}

func (d Dataset) Counts() Counts {
	counts := Counts{
		Champions:         len(d.Champions),
		StaticEntries:     len(d.Static),
		ContentByCategory: make(map[string]int),
	}
	for _, champion := range d.Champions {
		counts.Abilities += len(champion.Abilities)
		counts.Skins += len(champion.Skins)
	}
	for _, entry := range d.Static {
		counts.ContentByCategory[entry.Category]++
	}
	return counts
}

func (d Dataset) MediaURLs() []string {
	unique := make(map[string]struct{})
	add := func(value string) {
		if value != "" {
			unique[value] = struct{}{}
		}
	}
	for _, champion := range d.Champions {
		add(champion.IconURL)
		add(champion.SplashURL)
		add(champion.LoadingURL)
		add(champion.TileURL)
		for _, ability := range champion.Abilities {
			add(ability.IconURL)
		}
		for _, skin := range champion.Skins {
			add(skin.SplashURL)
			add(skin.LoadingURL)
			add(skin.TileURL)
		}
	}
	for _, entry := range d.Static {
		add(entry.IconURL)
	}
	urls := make([]string, 0, len(unique))
	for value := range unique {
		urls = append(urls, value)
	}
	slices.Sort(urls)
	return urls
}

// MediaFallbacks provides a conservative same-champion replacement for
// legacy skin records that Riot still publishes in JSON but no longer serves
// as an individual image. The original skin payload and number remain intact.
func (d Dataset) MediaFallbacks() map[string]string {
	result := make(map[string]string)
	for _, champion := range d.Champions {
		result[champion.LoadingURL] = champion.SplashURL
		result[champion.TileURL] = champion.SplashURL
		for _, skin := range champion.Skins {
			if skin.SplashURL != champion.SplashURL {
				result[skin.SplashURL] = champion.SplashURL
			}
			if skin.LoadingURL != champion.LoadingURL {
				result[skin.LoadingURL] = skin.SplashURL
			}
			if skin.TileURL != champion.TileURL {
				result[skin.TileURL] = skin.SplashURL
			}
		}
	}
	return result
}
