package gamemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// The Mythic+ character leaderboards, one dataset per region, published by
// scraper/parsers/mplus_leaderboard_dataset_service.py from the Blizzard APIs.
const leaderboardDatasetPrefix = "mplus-leaderboard-"

// leaderboardStaleAfter: crawls run every twelve hours, so two days without a
// success means the collector or the Blizzard API is down.
const leaderboardStaleAfter = 48 * time.Hour

const (
	// LeaderboardOverallDepth is the size of the unfiltered regional list; a
	// class, role or specialization list is exact to LeaderboardFilteredDepth
	// (the collector keeps the top 100 of every specialization).
	LeaderboardOverallDepth  = 500
	LeaderboardFilteredDepth = 100
	LeaderboardLeaders       = 3
)

var LeaderboardRegions = []string{"eu", "us", "kr", "tw"}

func IsLeaderboardRegion(region string) bool {
	for _, known := range LeaderboardRegions {
		if region == known {
			return true
		}
	}
	return false
}

// --- stored payload (schema_version 1) ---

type lbPayload struct {
	SchemaVersion int                `json:"schema_version"`
	Region        string             `json:"region"`
	Season        LeaderboardSeason  `json:"season"`
	Period        int                `json:"period"`
	Specs         []lbSpec           `json:"specs"`
	Items         map[string]lbItem  `json:"items"`
	Realms        map[string]lbNames `json:"realms"`
	Characters    []lbCharacter      `json:"characters"`
}

type lbNames struct {
	EN string `json:"en"`
	RU string `json:"ru,omitempty"`
}

type lbItem struct {
	Name    lbNames `json:"name"`
	Quality string  `json:"quality"`
	Icon    string  `json:"icon"`
}

type lbCharacter struct {
	Name    string  `json:"name"`
	Realm   string  `json:"realm"`
	Spec    int     `json:"spec"`
	Hero    *int    `json:"hero"`
	Score   float64 `json:"score"`
	Key     *int    `json:"key"`
	ILvl    *int    `json:"ilvl"`
	Faction string  `json:"faction"`
	Loadout string  `json:"loadout"`
}

type lbSpec struct {
	ID         int         `json:"id"`
	ClassID    int         `json:"class_id"`
	Role       string      `json:"role"`
	Count      int         `json:"count"`
	TopScore   *float64    `json:"top_score"`
	Hero       []lbHero    `json:"hero"`
	GearSample int         `json:"gear_sample"`
	Trinkets   []lbItemUse `json:"trinkets"`
	Weapons    []lbItemUse `json:"weapons"`
}

type lbHero struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Count int     `json:"count"`
	Share float64 `json:"share"`
	Top   *struct {
		Name    string  `json:"name"`
		Realm   string  `json:"realm"`
		Score   float64 `json:"score"`
		Loadout string  `json:"loadout"`
	} `json:"top"`
}

type lbItemUse struct {
	ID    int     `json:"id"`
	Count int     `json:"count"`
	Share float64 `json:"share"`
}

// --- public response ---

type LeaderboardSeason struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type LeaderboardRealm struct {
	Slug   string `json:"slug"`
	Name   string `json:"name"`
	NameRU string `json:"nameRu,omitempty"`
}

type LeaderboardEntry struct {
	Rank      int              `json:"rank"`
	Name      string           `json:"name"`
	Realm     LeaderboardRealm `json:"realm"`
	ClassID   int              `json:"classId"`
	SpecID    int              `json:"specId"`
	Role      string           `json:"role"`
	HeroID    *int             `json:"heroId,omitempty"`
	HeroName  string           `json:"heroName,omitempty"`
	Score     float64          `json:"score"`
	Key       *int             `json:"key,omitempty"`
	ItemLevel *int             `json:"itemLevel,omitempty"`
	Faction   string           `json:"faction,omitempty"`
	Loadout   string           `json:"loadout,omitempty"`
}

type LeaderboardRealmOption struct {
	LeaderboardRealm
	Count int `json:"count"`
}

type LeaderboardItem struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	NameRU  string  `json:"nameRu,omitempty"`
	Quality string  `json:"quality,omitempty"`
	Icon    string  `json:"icon,omitempty"`
	Count   int     `json:"count"`
	Share   float64 `json:"share"`
}

type LeaderboardHeroBuild struct {
	Name    string           `json:"name"`
	Realm   LeaderboardRealm `json:"realm"`
	Score   float64          `json:"score"`
	Loadout string           `json:"loadout"`
}

type LeaderboardHero struct {
	ID    int                   `json:"id"`
	Name  string                `json:"name"`
	Count int                   `json:"count"`
	Share float64               `json:"share"`
	Top   *LeaderboardHeroBuild `json:"top,omitempty"`
}

type LeaderboardSpecSummary struct {
	SpecID     int               `json:"specId"`
	ClassID    int               `json:"classId"`
	Role       string            `json:"role"`
	Count      int               `json:"count"`
	TopScore   *float64          `json:"topScore,omitempty"`
	Heroes     []LeaderboardHero `json:"heroes"`
	GearSample int               `json:"gearSample"`
	Trinkets   []LeaderboardItem `json:"trinkets"`
	Weapons    []LeaderboardItem `json:"weapons"`
}

type LeaderboardView struct {
	Role    string `json:"role,omitempty"`
	ClassID int    `json:"classId,omitempty"`
	SpecID  int    `json:"specId,omitempty"`
	Realm   string `json:"realm,omitempty"`
	Search  string `json:"q,omitempty"`
}

type LeaderboardPage struct {
	Game      string                        `json:"game"`
	Region    string                        `json:"region"`
	Status    string                        `json:"status"`
	Season    LeaderboardSeason             `json:"season"`
	View      LeaderboardView               `json:"view"`
	Depth     int                           `json:"depth"`
	Total     int                           `json:"total"`
	Page      int                           `json:"page"`
	PageSize  int                           `json:"pageSize"`
	Pages     int                           `json:"pages"`
	Entries   []LeaderboardEntry            `json:"entries"`
	Realms    []LeaderboardRealmOption      `json:"realms"`
	Leaders   map[string][]LeaderboardEntry `json:"leaders,omitempty"`
	Summary   *LeaderboardSpecSummary       `json:"summary,omitempty"`
	CheckedAt *time.Time                    `json:"checkedAt,omitempty"`
}

type LeaderboardQuery struct {
	Region   string
	Role     string
	ClassID  int
	SpecID   int
	Realm    string
	Search   string
	Page     int
	PageSize int
}

// LeaderboardSnapshot is one region's parsed payload, ordered by rating.
type LeaderboardSnapshot struct {
	Region    string
	Season    LeaderboardSeason
	CheckedAt *time.Time
	Status    string
	payload   lbPayload
	specs     map[int]lbSpec
	heroNames map[int]string
	searchKey []string
}

// ParseLeaderboardSnapshot validates the stored payload enough to serve it.
func ParseLeaderboardSnapshot(raw []byte) (*LeaderboardSnapshot, error) {
	var payload lbPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode leaderboard payload: %w", err)
	}
	if payload.SchemaVersion != 1 || !IsLeaderboardRegion(payload.Region) {
		return nil, errors.New("unsupported leaderboard payload")
	}
	snapshot := &LeaderboardSnapshot{Region: payload.Region, Season: payload.Season, payload: payload, specs: make(map[int]lbSpec, len(payload.Specs)), heroNames: map[int]string{}}
	for _, spec := range payload.Specs {
		if spec.Role != "tank" && spec.Role != "healer" && spec.Role != "dps" {
			return nil, fmt.Errorf("spec %d: unknown role %q", spec.ID, spec.Role)
		}
		snapshot.specs[spec.ID] = spec
		for _, hero := range spec.Hero {
			if hero.Name != "" {
				snapshot.heroNames[hero.ID] = hero.Name
			}
		}
	}
	kept := payload.Characters[:0]
	for _, character := range payload.Characters {
		if _, ok := snapshot.specs[character.Spec]; ok {
			kept = append(kept, character)
		}
	}
	sort.SliceStable(kept, func(i, j int) bool { return kept[i].Score > kept[j].Score })
	snapshot.payload.Characters = kept
	snapshot.searchKey = make([]string, len(kept))
	for index, character := range kept {
		realm := payload.Realms[character.Realm]
		snapshot.searchKey[index] = foldSearch(character.Name + " " + character.Realm + " " + realm.EN + " " + realm.RU)
	}
	return snapshot, nil
}

var foldTransformer = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// foldSearch lower-cases and strips accents, so "emptiness" finds "Émptinêss".
func foldSearch(value string) string {
	folded, _, err := transform.String(foldTransformer, value)
	if err != nil {
		folded = value
	}
	return strings.ToLower(folded)
}

func (s *LeaderboardSnapshot) realm(slug string) LeaderboardRealm {
	names := s.payload.Realms[slug]
	realm := LeaderboardRealm{Slug: slug, Name: names.EN, NameRU: names.RU}
	if realm.Name == "" {
		realm.Name = slug
	}
	if realm.NameRU == realm.Name {
		realm.NameRU = ""
	}
	return realm
}

func (s *LeaderboardSnapshot) entry(rank int, character lbCharacter) LeaderboardEntry {
	spec := s.specs[character.Spec]
	heroName := ""
	if character.Hero != nil {
		heroName = s.heroNames[*character.Hero]
	}
	return LeaderboardEntry{
		Rank: rank, Name: character.Name, Realm: s.realm(character.Realm), ClassID: spec.ClassID, SpecID: character.Spec,
		Role: spec.Role, HeroID: character.Hero, HeroName: heroName, Score: character.Score, Key: character.Key, ItemLevel: character.ILvl,
		Faction: character.Faction, Loadout: character.Loadout,
	}
}

func (s *LeaderboardSnapshot) matches(character lbCharacter, query LeaderboardQuery) bool {
	spec := s.specs[character.Spec]
	return (query.Role == "" || spec.Role == query.Role) &&
		(query.ClassID == 0 || spec.ClassID == query.ClassID) &&
		(query.SpecID == 0 || character.Spec == query.SpecID)
}

// Query ranks the view (role, class, specialization) by rating, then narrows
// it by realm and name without renumbering, and returns one page.
func (s *LeaderboardSnapshot) Query(query LeaderboardQuery) LeaderboardPage {
	depth := LeaderboardOverallDepth
	if query.Role != "" || query.ClassID != 0 || query.SpecID != 0 {
		depth = LeaderboardFilteredDepth
	}
	if query.PageSize <= 0 {
		query.PageSize = 50
	}
	if query.Page <= 0 {
		query.Page = 1
	}
	search := foldSearch(strings.TrimSpace(query.Search))
	page := LeaderboardPage{
		Game: "wow", Region: s.Region, Status: s.Status, Season: s.Season, CheckedAt: s.CheckedAt,
		View: LeaderboardView{Role: query.Role, ClassID: query.ClassID, SpecID: query.SpecID, Realm: query.Realm, Search: strings.TrimSpace(query.Search)},
		Page: query.Page, PageSize: query.PageSize, Entries: []LeaderboardEntry{}, Realms: []LeaderboardRealmOption{},
	}
	realmCounts := map[string]int{}
	matched := make([]LeaderboardEntry, 0, query.PageSize)
	rank := 0
	for index, character := range s.payload.Characters {
		if rank >= depth {
			break
		}
		if !s.matches(character, query) {
			continue
		}
		rank++
		realmCounts[character.Realm]++
		if query.Realm != "" && character.Realm != query.Realm {
			continue
		}
		if search != "" && !strings.Contains(s.searchKey[index], search) {
			continue
		}
		page.Total++
		if page.Total > (query.Page-1)*query.PageSize && len(matched) < query.PageSize {
			matched = append(matched, s.entry(rank, character))
		}
	}
	page.Depth = rank
	page.Entries = matched
	page.Pages = (page.Total + query.PageSize - 1) / query.PageSize
	for slug, count := range realmCounts {
		page.Realms = append(page.Realms, LeaderboardRealmOption{LeaderboardRealm: s.realm(slug), Count: count})
	}
	sort.Slice(page.Realms, func(i, j int) bool {
		return strings.ToLower(page.Realms[i].Name) < strings.ToLower(page.Realms[j].Name)
	})
	page.Leaders = s.leaders()
	if query.SpecID != 0 {
		page.Summary = s.summary(query.SpecID)
	}
	return page
}

func (s *LeaderboardSnapshot) leaders() map[string][]LeaderboardEntry {
	leaders := map[string][]LeaderboardEntry{"tank": {}, "healer": {}, "dps": {}}
	for _, character := range s.payload.Characters {
		role := s.specs[character.Spec].Role
		if len(leaders[role]) < LeaderboardLeaders {
			leaders[role] = append(leaders[role], s.entry(len(leaders[role])+1, character))
		}
		if len(leaders["tank"]) == LeaderboardLeaders && len(leaders["healer"]) == LeaderboardLeaders && len(leaders["dps"]) == LeaderboardLeaders {
			break
		}
	}
	return leaders
}

func (s *LeaderboardSnapshot) items(uses []lbItemUse) []LeaderboardItem {
	items := make([]LeaderboardItem, 0, len(uses))
	for _, use := range uses {
		stored, ok := s.payload.Items[fmt.Sprint(use.ID)]
		if !ok || stored.Name.EN == "" {
			continue
		}
		items = append(items, LeaderboardItem{ID: use.ID, Name: stored.Name.EN, NameRU: stored.Name.RU, Quality: stored.Quality, Icon: stored.Icon, Count: use.Count, Share: use.Share})
	}
	return items
}

func (s *LeaderboardSnapshot) summary(specID int) *LeaderboardSpecSummary {
	spec, ok := s.specs[specID]
	if !ok {
		return nil
	}
	summary := &LeaderboardSpecSummary{
		SpecID: spec.ID, ClassID: spec.ClassID, Role: spec.Role, Count: spec.Count, TopScore: spec.TopScore,
		Heroes: make([]LeaderboardHero, 0, len(spec.Hero)), GearSample: spec.GearSample,
		Trinkets: s.items(spec.Trinkets), Weapons: s.items(spec.Weapons),
	}
	for _, hero := range spec.Hero {
		item := LeaderboardHero{ID: hero.ID, Name: hero.Name, Count: hero.Count, Share: hero.Share}
		if hero.Top != nil && hero.Top.Loadout != "" {
			item.Top = &LeaderboardHeroBuild{Name: hero.Top.Name, Realm: s.realm(hero.Top.Realm), Score: hero.Top.Score, Loadout: hero.Top.Loadout}
		}
		summary.Heroes = append(summary.Heroes, item)
	}
	return summary
}

// --- store ---

type leaderboardCacheEntry struct {
	snapshotID string
	snapshot   *LeaderboardSnapshot
}

type leaderboardCache struct {
	mu      sync.Mutex
	entries map[string]leaderboardCacheEntry
}

var sharedLeaderboardCache = &leaderboardCache{entries: map[string]leaderboardCacheEntry{}}

// WoWMythicPlusLeaderboard returns the region's last good snapshot; the parsed
// payload is cached per snapshot, so a request costs one small query.
func (s *Service) WoWMythicPlusLeaderboard(ctx context.Context, region string) (*LeaderboardSnapshot, error) {
	if !IsLeaderboardRegion(region) {
		return nil, ErrSnapshotNotFound
	}
	var snapshotID string
	var checkedAt *time.Time
	err := s.db.QueryRow(ctx, `
		SELECT d.current_snapshot_id::text, d.last_success_at
		FROM datasets d
		WHERE d.slug = $1 AND d.current_snapshot_id IS NOT NULL
	`, leaderboardDatasetPrefix+region).Scan(&snapshotID, &checkedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSnapshotNotFound
	}
	if err != nil {
		return nil, err
	}
	cache := sharedLeaderboardCache
	cache.mu.Lock()
	cached, ok := cache.entries[region]
	cache.mu.Unlock()
	var snapshot *LeaderboardSnapshot
	if ok && cached.snapshotID == snapshotID {
		snapshot = cached.snapshot
	} else {
		var payload []byte
		if err := s.db.QueryRow(ctx, `SELECT payload FROM dataset_snapshots WHERE id = $1::uuid`, snapshotID).Scan(&payload); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrSnapshotNotFound
			}
			return nil, err
		}
		snapshot, err = ParseLeaderboardSnapshot(payload)
		if err != nil {
			return nil, err
		}
		cache.mu.Lock()
		cache.entries[region] = leaderboardCacheEntry{snapshotID: snapshotID, snapshot: snapshot}
		cache.mu.Unlock()
	}
	// The parsed snapshot is shared and read-only; status travels on a copy.
	view := *snapshot
	view.CheckedAt = checkedAt
	view.Status = leaderboardStatus(checkedAt, s.now())
	return &view, nil
}

func leaderboardStatus(checkedAt *time.Time, now time.Time) string {
	if checkedAt == nil || now.Sub(checkedAt.UTC()) > leaderboardStaleAfter {
		return "stale"
	}
	return "live"
}
