package leagueimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
)

const (
	dataDragonBase      = "https://ddragon.leagueoflegends.com"
	communityDragonBase = "https://raw.communitydragon.org"
)

var versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

type Source struct {
	client           *http.Client
	baseURL          string
	communityBaseURL string
	workers          int
}

func NewSource(client *http.Client, workers int) *Source {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	if workers < 1 {
		workers = 12
	}
	return &Source{client: client, baseURL: dataDragonBase, communityBaseURL: communityDragonBase, workers: workers}
}

func (s *Source) WithBaseURL(baseURL string) *Source {
	clone := *s
	clone.baseURL = strings.TrimRight(baseURL, "/")
	return &clone
}

func (s *Source) WithCommunityBaseURL(baseURL string) *Source {
	clone := *s
	clone.communityBaseURL = strings.TrimRight(baseURL, "/")
	return &clone
}

func (s *Source) LatestVersion(ctx context.Context) (string, error) {
	var versions []string
	if err := s.getJSON(ctx, s.baseURL+"/api/versions.json", &versions); err != nil {
		return "", fmt.Errorf("fetch Data Dragon versions: %w", err)
	}
	if len(versions) == 0 || !versionPattern.MatchString(versions[0]) {
		return "", errors.New("Data Dragon returned no valid version")
	}
	return versions[0], nil
}

func (s *Source) Load(ctx context.Context, version string) (Dataset, error) {
	if version == "" || version == "latest" {
		var err error
		version, err = s.LatestVersion(ctx)
		if err != nil {
			return Dataset{}, err
		}
	}
	if !versionPattern.MatchString(version) {
		return Dataset{}, errors.New("Data Dragon version must look like 16.17.1")
	}

	indexes := make(map[string]championIndex, 2)
	for _, locale := range []string{LocaleEnglish, LocaleRussian} {
		endpoint := s.dataURL(version, locale, "champion.json")
		var index championIndex
		if err := s.getJSON(ctx, endpoint, &index); err != nil {
			return Dataset{}, fmt.Errorf("fetch %s champion index: %w", locale, err)
		}
		indexes[locale] = index
	}
	if len(indexes[LocaleEnglish].Data) == 0 {
		return Dataset{}, errors.New("English champion index is empty")
	}
	if len(indexes[LocaleEnglish].Data) != len(indexes[LocaleRussian].Data) {
		return Dataset{}, fmt.Errorf("champion locale coverage mismatch: en_US=%d ru_RU=%d", len(indexes[LocaleEnglish].Data), len(indexes[LocaleRussian].Data))
	}

	names := make([]string, 0, len(indexes[LocaleEnglish].Data))
	for name := range indexes[LocaleEnglish].Data {
		names = append(names, name)
	}
	slices.Sort(names)
	champions := make([]Champion, len(names))
	group, groupContext := errgroup.WithContext(ctx)
	group.SetLimit(s.workers)
	for index, internalName := range names {
		index, internalName := index, internalName
		group.Go(func() error {
			localized := make(map[string]championDocument, 2)
			for _, locale := range []string{LocaleEnglish, LocaleRussian} {
				var document championDocument
				endpoint := s.dataURL(version, locale, "champion/"+url.PathEscape(internalName)+".json")
				if err := s.getJSON(groupContext, endpoint, &document); err != nil {
					return fmt.Errorf("fetch %s/%s: %w", locale, internalName, err)
				}
				localized[locale] = document
			}
			champion, err := buildChampion(version, internalName, localized)
			if err != nil {
				return err
			}
			champions[index] = champion
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return Dataset{}, err
	}

	static, sourceURLs, err := s.loadStatic(ctx, version)
	if err != nil {
		return Dataset{}, err
	}
	dataset := Dataset{Version: version, Champions: champions, Static: static, SourceURLs: sourceURLs}
	if err := validateDataset(dataset); err != nil {
		return Dataset{}, err
	}
	return dataset, nil
}

type championIndex struct {
	Data map[string]json.RawMessage `json:"data"`
}

type championDocument struct {
	Data map[string]championPayload `json:"data"`
}

type imagePayload struct {
	Full string `json:"full"`
}

type championPayload struct {
	ID        string           `json:"id"`
	Key       string           `json:"key"`
	Name      string           `json:"name"`
	Title     string           `json:"title"`
	Blurb     string           `json:"blurb"`
	Lore      string           `json:"lore"`
	AllyTips  []string         `json:"allytips"`
	EnemyTips []string         `json:"enemytips"`
	Tags      []string         `json:"tags"`
	Partype   string           `json:"partype"`
	Info      json.RawMessage  `json:"info"`
	Stats     json.RawMessage  `json:"stats"`
	Image     imagePayload     `json:"image"`
	Passive   abilityPayload   `json:"passive"`
	Spells    []abilityPayload `json:"spells"`
	Skins     []skinPayload    `json:"skins"`
}

type abilityPayload struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Tooltip     string          `json:"tooltip"`
	Image       imagePayload    `json:"image"`
	Cooldown    json.RawMessage `json:"cooldown"`
	Cost        json.RawMessage `json:"cost"`
	Range       json.RawMessage `json:"range"`
	Vars        json.RawMessage `json:"vars"`
	Effect      json.RawMessage `json:"effectBurn"`
}

type skinPayload struct {
	ID         string `json:"id"`
	Num        int    `json:"num"`
	Name       string `json:"name"`
	Chromas    bool   `json:"chromas"`
	ParentSkin *int   `json:"parentSkin,omitempty"`
}

func buildChampion(version, internalName string, documents map[string]championDocument) (Champion, error) {
	english, exists := documents[LocaleEnglish].Data[internalName]
	if !exists {
		return Champion{}, fmt.Errorf("%s missing from English champion detail", internalName)
	}
	russian, exists := documents[LocaleRussian].Data[internalName]
	if !exists {
		return Champion{}, fmt.Errorf("%s missing from Russian champion detail", internalName)
	}
	riotKey, err := strconv.Atoi(english.Key)
	if err != nil || riotKey <= 0 {
		return Champion{}, fmt.Errorf("%s has invalid Riot key %q", internalName, english.Key)
	}
	payload, err := json.Marshal(english)
	if err != nil {
		return Champion{}, fmt.Errorf("encode %s source payload: %w", internalName, err)
	}
	champion := Champion{
		RiotKey: riotKey, Slug: slugify(english.ID), InternalName: english.ID,
		ResourceType: english.Partype, Tags: english.Tags, Info: nonNilJSON(english.Info, `{}`),
		Stats: nonNilJSON(english.Stats, `{}`), Payload: payload,
		IconURL:    dataImageURL(version, "champion", english.Image.Full),
		SplashURL:  globalChampionImageURL("splash", english.ID, 0),
		LoadingURL: globalChampionImageURL("loading", english.ID, 0),
		TileURL:    globalChampionImageURL("tiles", english.ID, 0),
		Localizations: map[string]Localization{
			LocaleEnglish: championLocalization(english),
			LocaleRussian: championLocalization(russian),
		},
	}
	champion.Abilities = buildAbilities(version, english, russian)
	champion.Skins, err = buildSkins(english, russian)
	if err != nil {
		return Champion{}, fmt.Errorf("build %s skins: %w", internalName, err)
	}
	return champion, nil
}

func championLocalization(value championPayload) Localization {
	return Localization{Name: value.Name, Title: value.Title, Blurb: value.Blurb, Lore: value.Lore, AllyTips: value.AllyTips, EnemyTips: value.EnemyTips}
}

func buildAbilities(version string, english, russian championPayload) []Ability {
	result := make([]Ability, 0, 1+len(english.Spells))
	result = append(result, newAbility(version, english.Passive, russian.Passive, "passive", "P", 0))
	slots := []string{"Q", "W", "E", "R"}
	for index, value := range english.Spells {
		localized := abilityPayload{}
		if index < len(russian.Spells) {
			localized = russian.Spells[index]
		}
		slot := "EXTRA"
		if index < len(slots) {
			slot = slots[index]
		}
		result = append(result, newAbility(version, value, localized, "spell", slot, int16(index+1)))
	}
	return result
}

func newAbility(version string, english, russian abilityPayload, kind, slot string, order int16) Ability {
	payload, _ := json.Marshal(english)
	group := "spell"
	if kind == "passive" {
		group = "passive"
	}
	key := english.ID
	if key == "" {
		key = "passive"
	}
	return Ability{
		Key: key, Kind: kind, Slot: slot, DisplayOrder: order,
		Cooldowns: nonNilJSON(english.Cooldown, `[]`), Costs: nonNilJSON(english.Cost, `[]`),
		Ranges: nonNilJSON(english.Range, `[]`), Variables: nonNilJSON(english.Vars, `[]`),
		Effects: nonNilJSON(english.Effect, `[]`), Payload: payload,
		IconURL: dataImageURL(version, group, english.Image.Full),
		Localizations: map[string]Localization{
			LocaleEnglish: {Name: english.Name, Description: english.Description, Tooltip: english.Tooltip},
			LocaleRussian: {Name: russian.Name, Description: russian.Description, Tooltip: russian.Tooltip},
		},
	}
}

func buildSkins(english, russian championPayload) ([]Skin, error) {
	russianByNumber := make(map[int]skinPayload, len(russian.Skins))
	for _, skin := range russian.Skins {
		russianByNumber[skin.Num] = skin
	}
	result := make([]Skin, 0, len(english.Skins))
	for _, skin := range english.Skins {
		riotID, err := strconv.ParseInt(skin.ID, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid skin id %q", skin.ID)
		}
		localized, ok := russianByNumber[skin.Num]
		if !ok {
			return nil, fmt.Errorf("skin %d missing Russian localization", skin.Num)
		}
		payload, _ := json.Marshal(skin)
		imageNumber := skin.Num
		if skin.ParentSkin != nil {
			imageNumber = *skin.ParentSkin
		}
		result = append(result, Skin{
			RiotID: riotID, Number: skin.Num, HasChromas: skin.Chromas, Payload: payload,
			SplashURL:  globalChampionImageURL("splash", english.ID, imageNumber),
			LoadingURL: globalChampionImageURL("loading", english.ID, imageNumber),
			TileURL:    globalChampionImageURL("tiles", english.ID, imageNumber),
			Localizations: map[string]Localization{
				LocaleEnglish: {Name: skin.Name}, LocaleRussian: {Name: localized.Name},
			},
		})
	}
	return result, nil
}

type staticDocument struct {
	Data map[string]json.RawMessage `json:"data"`
}

func (s *Source) loadStatic(ctx context.Context, version string) ([]StaticEntry, []string, error) {
	sources := []struct{ category, filename string }{
		{"items", "item.json"}, {"summoner-spells", "summoner.json"},
		{"maps", "map.json"}, {"profile-icons", "profileicon.json"},
	}
	result := make([]StaticEntry, 0, 2500)
	urls := make([]string, 0, len(sources)*2+2)
	for _, source := range sources {
		localized := make(map[string]map[string]json.RawMessage, 2)
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			endpoint := s.dataURL(version, locale, source.filename)
			urls = append(urls, endpoint)
			var document staticDocument
			if err := s.getJSON(ctx, endpoint, &document); err != nil {
				return nil, nil, fmt.Errorf("fetch %s %s: %w", locale, source.category, err)
			}
			localized[locale] = document.Data
		}
		entries, err := buildStaticCategory(version, source.category, localized)
		if err != nil {
			return nil, nil, err
		}
		result = append(result, entries...)
	}
	runes, runeURLs, err := s.loadRunes(ctx, version)
	if err != nil {
		return nil, nil, err
	}
	result = append(result, runes...)
	urls = append(urls, runeURLs...)
	shards, shardURLs, err := s.loadRuneShards(ctx, version)
	if err != nil {
		return nil, nil, err
	}
	result = append(result, shards...)
	urls = append(urls, shardURLs...)
	slices.SortFunc(result, func(a, b StaticEntry) int {
		if category := strings.Compare(a.Category, b.Category); category != 0 {
			return category
		}
		return strings.Compare(a.ExternalKey, b.ExternalKey)
	})
	return result, urls, nil
}

func buildStaticCategory(version, category string, localized map[string]map[string]json.RawMessage) ([]StaticEntry, error) {
	keys := make([]string, 0, len(localized[LocaleEnglish]))
	for key := range localized[LocaleEnglish] {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	result := make([]StaticEntry, 0, len(keys))
	for _, key := range keys {
		englishRaw := localized[LocaleEnglish][key]
		russianRaw, ok := localized[LocaleRussian][key]
		if !ok {
			return nil, fmt.Errorf("%s %s missing Russian localization", category, key)
		}
		english, err := decodeStaticFields(englishRaw)
		if err != nil {
			return nil, fmt.Errorf("decode %s %s: %w", category, key, err)
		}
		russian, err := decodeStaticFields(russianRaw)
		if err != nil {
			return nil, fmt.Errorf("decode Russian %s %s: %w", category, key, err)
		}
		result = append(result, StaticEntry{
			Category: category, ExternalKey: key, Slug: slugify(firstNonEmpty(english.Name, key)), Tags: english.Tags,
			IconURL: dataImageURL(version, staticImageGroup(category), english.Image.Full), Payload: englishRaw,
			Localizations: map[string]Localization{
				LocaleEnglish: {Name: english.Name, Description: english.Description, Payload: englishRaw},
				LocaleRussian: {Name: russian.Name, Description: russian.Description, Payload: russianRaw},
			},
		})
	}
	return result, nil
}

type staticFields struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Tags        []string     `json:"tags"`
	Image       imagePayload `json:"image"`
}

func decodeStaticFields(raw json.RawMessage) (staticFields, error) {
	var value staticFields
	return value, json.Unmarshal(raw, &value)
}

func staticImageGroup(category string) string {
	switch category {
	case "items":
		return "item"
	case "summoner-spells":
		return "spell"
	case "maps":
		return "map"
	case "profile-icons":
		return "profileicon"
	default:
		return ""
	}
}

type runePath struct {
	ID    int        `json:"id"`
	Key   string     `json:"key"`
	Icon  string     `json:"icon"`
	Name  string     `json:"name"`
	Slots []runeSlot `json:"slots"`
}

type runeSlot struct {
	Runes []runeValue `json:"runes"`
}
type runeValue struct {
	ID        int    `json:"id"`
	Key       string `json:"key"`
	Icon      string `json:"icon"`
	Name      string `json:"name"`
	ShortDesc string `json:"shortDesc"`
	LongDesc  string `json:"longDesc"`
}

type clientPerk struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Tooltip   string `json:"tooltip"`
	ShortDesc string `json:"shortDesc"`
	LongDesc  string `json:"longDesc"`
	IconPath  string `json:"iconPath"`
}

func (s *Source) loadRuneShards(ctx context.Context, version string) ([]StaticEntry, []string, error) {
	localized := make(map[string][]clientPerk, 2)
	locales := map[string]string{LocaleEnglish: "default", LocaleRussian: "ru_ru"}
	urls := make([]string, 0, len(locales))
	for _, locale := range []string{LocaleEnglish, LocaleRussian} {
		endpoint := s.communityDataURL(version, locales[locale], "perks.json")
		urls = append(urls, endpoint)
		var perks []clientPerk
		if err := s.getJSON(ctx, endpoint, &perks); err != nil {
			return nil, nil, fmt.Errorf("fetch %s rune shards: %w", locale, err)
		}
		localized[locale] = perks
	}
	entries, err := buildRuneShards(version, localized[LocaleEnglish], localized[LocaleRussian])
	if err != nil {
		return nil, nil, err
	}
	if len(entries) < 8 {
		return nil, nil, fmt.Errorf("rune shard coverage too small: %d", len(entries))
	}
	return entries, urls, nil
}

func buildRuneShards(version string, english, russian []clientPerk) ([]StaticEntry, error) {
	russianByID := make(map[int]clientPerk, len(russian))
	for _, perk := range russian {
		russianByID[perk.ID] = perk
	}
	result := make([]StaticEntry, 0, 10)
	for _, en := range english {
		if en.ID < 5000 || en.ID >= 5100 {
			continue
		}
		ru, ok := russianByID[en.ID]
		if !ok {
			return nil, fmt.Errorf("rune shard %d missing Russian localization", en.ID)
		}
		filename := path.Base(en.IconPath)
		if filename == "." || filename == "/" || !strings.EqualFold(path.Ext(filename), ".png") {
			return nil, fmt.Errorf("rune shard %d has invalid icon path %q", en.ID, en.IconPath)
		}
		enRaw, _ := json.Marshal(en)
		ruRaw, _ := json.Marshal(ru)
		result = append(result, StaticEntry{
			Category: "runes", ExternalKey: strconv.Itoa(en.ID), Slug: slugify(firstNonEmpty(en.Name, strconv.Itoa(en.ID))),
			Tags: []string{"stat-shard"}, IconURL: dataDragonBase + "/cdn/img/perk-images/StatMods/" + url.PathEscape(filename), Payload: enRaw,
			Localizations: map[string]Localization{
				LocaleEnglish: {Name: en.Name, Description: firstNonEmpty(en.LongDesc, en.ShortDesc, en.Tooltip), Payload: enRaw},
				LocaleRussian: {Name: ru.Name, Description: firstNonEmpty(ru.LongDesc, ru.ShortDesc, ru.Tooltip), Payload: ruRaw},
			},
		})
	}
	slices.SortFunc(result, func(a, b StaticEntry) int { return strings.Compare(a.ExternalKey, b.ExternalKey) })
	return result, nil
}

func (s *Source) loadRunes(ctx context.Context, version string) ([]StaticEntry, []string, error) {
	localized := make(map[string][]runePath, 2)
	urls := make([]string, 0, 2)
	for _, locale := range []string{LocaleEnglish, LocaleRussian} {
		endpoint := s.dataURL(version, locale, "runesReforged.json")
		urls = append(urls, endpoint)
		var paths []runePath
		if err := s.getJSON(ctx, endpoint, &paths); err != nil {
			return nil, nil, fmt.Errorf("fetch %s runes: %w", locale, err)
		}
		localized[locale] = paths
	}
	flatten := func(paths []runePath) map[int]runeValue {
		values := make(map[int]runeValue)
		for _, path := range paths {
			values[path.ID] = runeValue{ID: path.ID, Key: path.Key, Icon: path.Icon, Name: path.Name, ShortDesc: "Rune path"}
			for _, slot := range path.Slots {
				for _, rune := range slot.Runes {
					values[rune.ID] = rune
				}
			}
		}
		return values
	}
	english, russian := flatten(localized[LocaleEnglish]), flatten(localized[LocaleRussian])
	ids := make([]int, 0, len(english))
	for id := range english {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	result := make([]StaticEntry, 0, len(ids))
	for _, id := range ids {
		en, ru := english[id], russian[id]
		enRaw, _ := json.Marshal(en)
		ruRaw, _ := json.Marshal(ru)
		result = append(result, StaticEntry{
			Category: "runes", ExternalKey: strconv.Itoa(id), Slug: slugify(en.Key), IconURL: s.baseURL + "/cdn/img/" + strings.TrimLeft(en.Icon, "/"), Payload: enRaw,
			Localizations: map[string]Localization{
				LocaleEnglish: {Name: en.Name, Description: firstNonEmpty(en.LongDesc, en.ShortDesc), Payload: enRaw},
				LocaleRussian: {Name: ru.Name, Description: firstNonEmpty(ru.LongDesc, ru.ShortDesc), Payload: ruRaw},
			},
		})
	}
	return result, urls, nil
}

func (s *Source) getJSON(ctx context.Context, endpoint string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "Gildra-LoL-Catalog/1.0 (+https://gildra.net)")
	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close() //nolint:errcheck
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("%s returned HTTP %d", endpoint, response.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 32<<20))
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode %s: %w", endpoint, err)
	}
	return nil
}

func (s *Source) dataURL(version, locale, filename string) string {
	return s.baseURL + "/cdn/" + version + "/data/" + locale + "/" + filename
}
func (s *Source) communityDataURL(version, locale, filename string) string {
	parts := strings.Split(version, ".")
	branch := version
	if len(parts) >= 2 {
		branch = strings.Join(parts[:2], ".")
	}
	return fmt.Sprintf("%s/%s/plugins/rcp-be-lol-game-data/global/%s/v1/%s", s.communityBaseURL, branch, locale, filename)
}
func dataImageURL(version, group, filename string) string {
	if filename == "" || group == "" {
		return ""
	}
	return dataDragonBase + "/cdn/" + version + "/img/" + group + "/" + url.PathEscape(filename)
}
func globalChampionImageURL(group, champion string, skin int) string {
	return fmt.Sprintf("%s/cdn/img/champion/%s/%s_%d.jpg", dataDragonBase, group, champion, skin)
}

func validateDataset(dataset Dataset) error {
	if !versionPattern.MatchString(dataset.Version) {
		return errors.New("dataset version is invalid")
	}
	if len(dataset.Champions) < 150 {
		return fmt.Errorf("champion coverage too small: %d", len(dataset.Champions))
	}
	seen := make(map[int]struct{}, len(dataset.Champions))
	for _, champion := range dataset.Champions {
		if champion.RiotKey <= 0 || champion.Slug == "" || champion.InternalName == "" {
			return errors.New("champion identity is incomplete")
		}
		if _, exists := seen[champion.RiotKey]; exists {
			return fmt.Errorf("duplicate champion Riot key %d", champion.RiotKey)
		}
		seen[champion.RiotKey] = struct{}{}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			if champion.Localizations[locale].Name == "" {
				return fmt.Errorf("champion %s missing %s name", champion.Slug, locale)
			}
		}
		if len(champion.Abilities) < 5 || len(champion.Skins) == 0 {
			return fmt.Errorf("champion %s has incomplete abilities or skins", champion.Slug)
		}
	}
	if len(dataset.Static) < 1000 {
		return fmt.Errorf("static content coverage too small: %d", len(dataset.Static))
	}
	return nil
}

var slugInvalid = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(value string) string {
	return strings.Trim(slugInvalid.ReplaceAllString(strings.ToLower(value), "-"), "-")
}
func nonNilJSON(value json.RawMessage, fallback string) json.RawMessage {
	if len(value) == 0 || string(value) == "null" {
		return json.RawMessage(fallback)
	}
	return value
}
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
