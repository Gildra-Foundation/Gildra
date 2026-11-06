package gamemeta

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Errors a bad filter maps to (HTTP 400).
var (
	ErrUnknownDungeon = errors.New("unknown dungeon")
	ErrInvalidSpecs   = errors.New("invalid specs")
	ErrInvalidRegion  = errors.New("invalid region")
)

var runsRegions = map[string]bool{"us": true, "eu": true, "kr": true, "tw": true}

// RunsFilter narrows the run sample. Zero values mean "everything".
type RunsFilter struct {
	Dungeon  string `json:"dungeon"`
	Region   string `json:"region"`
	MinLevel int    `json:"minLevel"`
	Specs    []int  `json:"specs"`
}

// Group is the five specializations of a run or a composition.
type Group struct {
	Tank   int    `json:"tank"`
	Healer int    `json:"healer"`
	DPS    [3]int `json:"dps"`
}

func (g Group) slots() [5]int { return [5]int{g.Tank, g.Healer, g.DPS[0], g.DPS[1], g.DPS[2]} }

func (g Group) key() string {
	return fmt.Sprintf("%d-%d-%d-%d-%d", g.Tank, g.Healer, g.DPS[0], g.DPS[1], g.DPS[2])
}

func runGroup(run Run) Group { return Group{Tank: run.Tank, Healer: run.Healer, DPS: run.DPS} }

// SampleSummary describes the filtered runs every number of a response comes from.
type SampleSummary struct {
	Runs     int    `json:"runs"`
	MinLevel int    `json:"minLevel"`
	MaxLevel int    `json:"maxLevel"`
	Dungeons int    `json:"dungeons"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
}

// RunsEnvelope is the shared head of every runs-derived response.
type RunsEnvelope struct {
	Game      string        `json:"game"`
	Status    string        `json:"status"`
	Source    Source        `json:"source"`
	FetchedAt time.Time     `json:"fetchedAt"`
	CheckedAt *time.Time    `json:"checkedAt,omitempty"`
	Season    RunsSeason    `json:"season"`
	Dungeons  []RunsDungeon `json:"dungeons"`
	Specs     []RunsSpec    `json:"specs"`
	Regions   []string      `json:"regions"`
	Filter    RunsFilter    `json:"filter"`
	Sample    SampleSummary `json:"sample"`
	// Key levels of the whole snapshot, so a client can offer every level filter.
	Levels LevelRange `json:"levelRange"`
}

// LevelRange is the lowest and highest key level of the snapshot.
type LevelRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// ParseSpecList reads "250,65,62" (at most five ids).
func ParseSpecList(raw string) ([]int, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	parts := strings.Split(raw, ",")
	if len(parts) > 5 {
		return nil, ErrInvalidSpecs
	}
	specs := make([]int, 0, len(parts))
	for _, part := range parts {
		id, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || id < 1 || id > 99999 {
			return nil, ErrInvalidSpecs
		}
		specs = append(specs, id)
	}
	return specs, nil
}

// validate checks the filter against the snapshot and returns the dungeon id (0 = all).
func (s *RunsSnapshot) validate(filter *RunsFilter) (int, error) {
	if filter.Region == "all" {
		filter.Region = ""
	}
	if filter.Region != "" && !runsRegions[filter.Region] {
		return 0, ErrInvalidRegion
	}
	dungeonID := 0
	if filter.Dungeon == "all" {
		filter.Dungeon = ""
	}
	if filter.Dungeon != "" {
		dungeon, ok := s.bySlug[filter.Dungeon]
		if !ok {
			return 0, ErrUnknownDungeon
		}
		dungeonID = dungeon.ID
	}
	roles := map[string]int{}
	for _, id := range filter.Specs {
		spec, ok := s.specs[id]
		if !ok {
			return 0, ErrInvalidSpecs
		}
		roles[spec.Role]++
	}
	if roles["tank"] > 1 || roles["healer"] > 1 || roles["dps"] > 3 {
		return 0, ErrInvalidSpecs
	}
	sort.Ints(filter.Specs)
	return dungeonID, nil
}

// containsAll: the run's five slots hold every chosen spec (as a multiset).
func containsAll(slots [5]int, chosen []int) bool {
	used := [5]bool{}
	for _, want := range chosen {
		found := false
		for index, have := range slots {
			if !used[index] && have == want {
				used[index], found = true, true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func (s *RunsSnapshot) filtered(filter RunsFilter, dungeonID int) []Run {
	runs := make([]Run, 0, len(s.Payload.Runs))
	for _, run := range s.Payload.Runs {
		if dungeonID != 0 && run.Dungeon != dungeonID {
			continue
		}
		if filter.Region != "" && run.Region != filter.Region {
			continue
		}
		if run.Level < filter.MinLevel {
			continue
		}
		if len(filter.Specs) > 0 && !containsAll(runGroup(run).slots(), filter.Specs) {
			continue
		}
		runs = append(runs, run)
	}
	return runs
}

func (s *RunsSnapshot) envelope(filter RunsFilter, runs []Run) RunsEnvelope {
	if filter.Specs == nil {
		filter.Specs = []int{}
	}
	return RunsEnvelope{
		Game: "wow", Status: s.Status, Source: s.Source, FetchedAt: s.FetchedAt, CheckedAt: s.CheckedAt,
		Season: s.Payload.Season, Dungeons: s.Payload.Dungeons, Specs: s.Payload.Specs, Regions: s.Payload.Regions,
		Filter: filter, Sample: summarize(runs), Levels: s.levelRange(),
	}
}

func (s *RunsSnapshot) levelRange() LevelRange {
	all := summarize(s.Payload.Runs)
	return LevelRange{Min: all.MinLevel, Max: all.MaxLevel}
}

func summarize(runs []Run) SampleSummary {
	summary := SampleSummary{Runs: len(runs)}
	dungeons := map[int]bool{}
	for index, run := range runs {
		if index == 0 || run.Level < summary.MinLevel {
			summary.MinLevel = run.Level
		}
		if run.Level > summary.MaxLevel {
			summary.MaxLevel = run.Level
		}
		if summary.From == "" || run.CompletedAt < summary.From {
			summary.From = run.CompletedAt
		}
		if run.CompletedAt > summary.To {
			summary.To = run.CompletedAt
		}
		dungeons[run.Dungeon] = true
	}
	summary.Dungeons = len(dungeons)
	return summary
}

// timeLeft is the share of the timer left at the end of the run, in percent.
func timeLeft(run Run) float64 {
	if run.TimerMS <= 0 {
		return 0
	}
	return float64(run.TimerMS-run.ClearMS) / float64(run.TimerMS) * 100
}

func median(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	middle := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[middle]
	}
	return (sorted[middle-1] + sorted[middle]) / 2
}

func round1(value float64) float64 { return math.Round(value*10) / 10 }

func percentOf(part, whole int) float64 {
	if whole == 0 {
		return 0
	}
	return round1(float64(part) / float64(whole) * 100)
}

// RunStats are the numbers shown for any group of runs.
type RunStats struct {
	Runs           int     `json:"runs"`
	MaxLevel       int     `json:"maxLevel"`
	MedianLevel    float64 `json:"medianLevel"`
	MedianTimeLeft float64 `json:"medianTimeLeft"`
	// Share of runs timed with two or three upgrades (+2/+3).
	UpgradeShare float64 `json:"upgradeShare"`
}

type statsAccumulator struct {
	levels, left  []float64
	max, upgrades int
}

func (a *statsAccumulator) add(run Run) {
	a.levels = append(a.levels, float64(run.Level))
	a.left = append(a.left, timeLeft(run))
	if run.Level > a.max {
		a.max = run.Level
	}
	if run.Chests >= 2 {
		a.upgrades++
	}
}

func (a *statsAccumulator) stats() RunStats {
	return RunStats{
		Runs: len(a.levels), MaxLevel: a.max, MedianLevel: round1(median(a.levels)),
		MedianTimeLeft: round1(median(a.left)), UpgradeShare: percentOf(a.upgrades, len(a.levels)),
	}
}

// ---- Compositions --------------------------------------------------------

// Composition is one exact five-spec group.
type Composition struct {
	Group
	RunStats
	Share    float64 `json:"share"`
	Dungeons int     `json:"dungeons"`
}

// Candidate is a spec that fills an open slot next to the chosen specs.
type Candidate struct {
	Spec        int     `json:"spec"`
	Runs        int     `json:"runs"`
	Share       float64 `json:"share"`
	MedianLevel float64 `json:"medianLevel"`
	MaxLevel    int     `json:"maxLevel"`
}

// Fill suggests the open slots of a group from the runs that contain it.
type Fill struct {
	Selected   []int                  `json:"selected"`
	Matched    int                    `json:"matched"`
	Open       map[string]int         `json:"open"`
	Candidates map[string][]Candidate `json:"candidates"`
}

// Pair is two specializations of the same group and how much more often they
// meet than their separate popularity predicts (lift 1 = chance).
type Pair struct {
	A           int     `json:"a"`
	B           int     `json:"b"`
	Runs        int     `json:"runs"`
	Lift        float64 `json:"lift"`
	MedianLevel float64 `json:"medianLevel"`
}

// CompsResponse is GET /v1/meta/wow/mythic-plus/comps.
type CompsResponse struct {
	RunsEnvelope
	MinSample    int           `json:"minSample"`
	Compositions []Composition `json:"compositions"`
	Fill         Fill          `json:"fill"`
	Pairs        []Pair        `json:"pairs"`
}

const (
	compMinSample      = 3
	compLimit          = 40
	candidateMinSample = 3
	candidateLimit     = 10
	pairMinSample      = 20
	pairLimit          = 12
)

// Comps aggregates exact compositions, slot suggestions and spec pairs of the filtered runs.
func (s *RunsSnapshot) Comps(filter RunsFilter) (CompsResponse, error) {
	dungeonID, err := s.validate(&filter)
	if err != nil {
		return CompsResponse{}, err
	}
	runs := s.filtered(filter, dungeonID)
	response := CompsResponse{RunsEnvelope: s.envelope(filter, runs), MinSample: compMinSample}
	response.Compositions = compositions(runs)
	response.Fill = s.fill(filter.Specs, runs)
	// Pairs describe the whole filtered field, not only groups with the chosen specs.
	base := filter
	base.Specs = nil
	response.Pairs = pairs(s.filtered(base, dungeonID))
	return response, nil
}

func compositions(runs []Run) []Composition {
	type bucket struct {
		group    Group
		acc      statsAccumulator
		dungeons map[int]bool
	}
	buckets := map[string]*bucket{}
	for _, run := range runs {
		group := runGroup(run)
		item := buckets[group.key()]
		if item == nil {
			item = &bucket{group: group, dungeons: map[int]bool{}}
			buckets[group.key()] = item
		}
		item.acc.add(run)
		item.dungeons[run.Dungeon] = true
	}
	list := make([]Composition, 0, len(buckets))
	for _, item := range buckets {
		stats := item.acc.stats()
		if stats.Runs < compMinSample {
			continue
		}
		list = append(list, Composition{Group: item.group, RunStats: stats, Share: percentOf(stats.Runs, len(runs)), Dungeons: len(item.dungeons)})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Runs != list[j].Runs {
			return list[i].Runs > list[j].Runs
		}
		if list[i].MedianLevel != list[j].MedianLevel {
			return list[i].MedianLevel > list[j].MedianLevel
		}
		return list[i].key() < list[j].key()
	})
	if len(list) > compLimit {
		list = list[:compLimit]
	}
	return list
}

func (s *RunsSnapshot) fill(chosen []int, runs []Run) Fill {
	open := map[string]int{"tank": 1, "healer": 1, "dps": 3}
	for _, id := range chosen {
		open[s.specs[id].Role]--
	}
	type bucket struct {
		acc statsAccumulator
	}
	buckets := map[string]map[int]*bucket{"tank": {}, "healer": {}, "dps": {}}
	for _, run := range runs {
		slots := runGroup(run).slots()
		used := [5]bool{}
		for _, want := range chosen {
			for index, have := range slots {
				if !used[index] && have == want {
					used[index] = true
					break
				}
			}
		}
		seen := map[int]bool{}
		for index, spec := range slots {
			if used[index] || seen[spec] {
				continue
			}
			seen[spec] = true
			role := s.specs[spec].Role
			if open[role] <= 0 {
				continue
			}
			item := buckets[role][spec]
			if item == nil {
				item = &bucket{}
				buckets[role][spec] = item
			}
			item.acc.add(run)
		}
	}
	result := Fill{Selected: append([]int{}, chosen...), Matched: len(runs), Open: open, Candidates: map[string][]Candidate{}}
	for role, specs := range buckets {
		list := []Candidate{}
		for spec, item := range specs {
			stats := item.acc.stats()
			if stats.Runs < candidateMinSample {
				continue
			}
			list = append(list, Candidate{Spec: spec, Runs: stats.Runs, Share: percentOf(stats.Runs, len(runs)), MedianLevel: stats.MedianLevel, MaxLevel: stats.MaxLevel})
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i].Runs != list[j].Runs {
				return list[i].Runs > list[j].Runs
			}
			return list[i].Spec < list[j].Spec
		})
		if len(list) > candidateLimit {
			list = list[:candidateLimit]
		}
		result.Candidates[role] = list
	}
	return result
}

func pairs(runs []Run) []Pair {
	if len(runs) == 0 {
		return []Pair{}
	}
	single := map[int]int{}
	type bucket struct {
		runs   int
		levels []float64
	}
	together := map[[2]int]*bucket{}
	for _, run := range runs {
		distinct := map[int]bool{}
		for _, spec := range runGroup(run).slots() {
			distinct[spec] = true
		}
		ids := make([]int, 0, len(distinct))
		for spec := range distinct {
			ids = append(ids, spec)
			single[spec]++
		}
		sort.Ints(ids)
		for i := 0; i < len(ids); i++ {
			for j := i + 1; j < len(ids); j++ {
				key := [2]int{ids[i], ids[j]}
				item := together[key]
				if item == nil {
					item = &bucket{}
					together[key] = item
				}
				item.runs++
				item.levels = append(item.levels, float64(run.Level))
			}
		}
	}
	minimum := pairMinSample
	if share := len(runs) / 100; share > minimum {
		minimum = share
	}
	total := float64(len(runs))
	list := []Pair{}
	for key, item := range together {
		if item.runs < minimum {
			continue
		}
		expected := float64(single[key[0]]) / total * float64(single[key[1]]) / total
		lift := float64(item.runs) / total / expected
		if lift <= 1 {
			continue
		}
		list = append(list, Pair{A: key[0], B: key[1], Runs: item.runs, Lift: math.Round(lift*100) / 100, MedianLevel: round1(median(item.levels))})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Lift != list[j].Lift {
			return list[i].Lift > list[j].Lift
		}
		return list[i].Runs > list[j].Runs
	})
	if len(list) > pairLimit {
		list = list[:pairLimit]
	}
	return list
}

// ---- Season stats --------------------------------------------------------

// DungeonStats summarizes one dungeon of the filtered runs.
type DungeonStats struct {
	Slug string `json:"slug"`
	RunStats
}

// SpecPresence is how often a spec appears in the filtered runs.
type SpecPresence struct {
	Spec        int     `json:"spec"`
	Role        string  `json:"role"`
	Runs        int     `json:"runs"`
	Presence    float64 `json:"presence"`
	MedianLevel float64 `json:"medianLevel"`
}

// LevelCount is the number of runs at one key level.
type LevelCount struct {
	Level int `json:"level"`
	Runs  int `json:"runs"`
}

// StatsResponse is GET /v1/meta/wow/mythic-plus/stats.
type StatsResponse struct {
	RunsEnvelope
	Overall  RunStats                   `json:"overall"`
	Dungeons []DungeonStats             `json:"dungeonStats"`
	Specs    []SpecPresence             `json:"specPresence"`
	Levels   []LevelCount               `json:"levels"`
	Cutoffs  map[string]json.RawMessage `json:"cutoffs"`
}

// Stats summarizes the filtered runs (specs filter ignored) and passes the cutoffs through.
func (s *RunsSnapshot) Stats(filter RunsFilter) (StatsResponse, error) {
	filter.Specs = nil
	dungeonID, err := s.validate(&filter)
	if err != nil {
		return StatsResponse{}, err
	}
	runs := s.filtered(filter, dungeonID)
	response := StatsResponse{RunsEnvelope: s.envelope(filter, runs), Cutoffs: s.Payload.Cutoffs}
	if response.Cutoffs == nil {
		response.Cutoffs = map[string]json.RawMessage{}
	}
	overall := statsAccumulator{}
	perDungeon := map[int]*statsAccumulator{}
	perSpec := map[int]*statsAccumulator{}
	levels := map[int]int{}
	for _, run := range runs {
		overall.add(run)
		if perDungeon[run.Dungeon] == nil {
			perDungeon[run.Dungeon] = &statsAccumulator{}
		}
		perDungeon[run.Dungeon].add(run)
		levels[run.Level]++
		seen := map[int]bool{}
		for _, spec := range runGroup(run).slots() {
			if seen[spec] {
				continue
			}
			seen[spec] = true
			if perSpec[spec] == nil {
				perSpec[spec] = &statsAccumulator{}
			}
			perSpec[spec].add(run)
		}
	}
	response.Overall = overall.stats()
	response.Dungeons = []DungeonStats{}
	for _, dungeon := range s.Payload.Dungeons {
		if acc := perDungeon[dungeon.ID]; acc != nil {
			response.Dungeons = append(response.Dungeons, DungeonStats{Slug: dungeon.Slug, RunStats: acc.stats()})
		}
	}
	response.Specs = []SpecPresence{}
	for _, spec := range s.Payload.Specs {
		acc := perSpec[spec.ID]
		if acc == nil {
			continue
		}
		stats := acc.stats()
		response.Specs = append(response.Specs, SpecPresence{Spec: spec.ID, Role: spec.Role, Runs: stats.Runs, Presence: percentOf(stats.Runs, len(runs)), MedianLevel: stats.MedianLevel})
	}
	sort.SliceStable(response.Specs, func(i, j int) bool { return response.Specs[i].Runs > response.Specs[j].Runs })
	response.Levels = []LevelCount{}
	for level, count := range levels {
		response.Levels = append(response.Levels, LevelCount{Level: level, Runs: count})
	}
	sort.Slice(response.Levels, func(i, j int) bool { return response.Levels[i].Level < response.Levels[j].Level })
	return response, nil
}

// ---- Route finder --------------------------------------------------------

// RunLink is one run of the route finder with its Raider.IO page.
type RunLink struct {
	ID          int64   `json:"id"`
	URL         string  `json:"url"`
	Dungeon     string  `json:"dungeon"`
	Level       int     `json:"level"`
	Chests      int     `json:"chests"`
	ClearMS     int64   `json:"clearMs"`
	TimerMS     int64   `json:"timerMs"`
	TimeLeft    float64 `json:"timeLeft"`
	CompletedAt string  `json:"completedAt"`
	Region      string  `json:"region"`
	Group       Group   `json:"group"`
	Video       bool    `json:"video"`
}

// RunsResponse is GET /v1/meta/wow/mythic-plus/runs.
type RunsResponse struct {
	RunsEnvelope
	Sort  string    `json:"sort"`
	Limit int       `json:"limit"`
	Runs  []RunLink `json:"runs"`
}

// RunSorts are the accepted route-finder orders.
var RunSorts = map[string]bool{"level": true, "fast": true, "recent": true}

// Runs lists the filtered runs with link-outs, best first.
func (s *RunsSnapshot) Runs(filter RunsFilter, order string, limit int) (RunsResponse, error) {
	dungeonID, err := s.validate(&filter)
	if err != nil {
		return RunsResponse{}, err
	}
	runs := s.filtered(filter, dungeonID)
	sort.SliceStable(runs, func(i, j int) bool {
		a, b := runs[i], runs[j]
		switch order {
		case "fast":
			if timeLeft(a) != timeLeft(b) {
				return timeLeft(a) > timeLeft(b)
			}
		case "recent":
			if a.CompletedAt != b.CompletedAt {
				return a.CompletedAt > b.CompletedAt
			}
		}
		if a.Level != b.Level {
			return a.Level > b.Level
		}
		if a.ClearMS != b.ClearMS {
			return a.ClearMS < b.ClearMS
		}
		return a.ID < b.ID
	})
	response := RunsResponse{RunsEnvelope: s.envelope(filter, runs), Sort: order, Limit: limit, Runs: []RunLink{}}
	for index, run := range runs {
		if index >= limit {
			break
		}
		dungeon := s.dungeons[run.Dungeon]
		response.Runs = append(response.Runs, RunLink{
			ID: run.ID, URL: fmt.Sprintf("https://raider.io/mythic-plus-runs/%s/%d-%d-%s", s.Payload.Season.Slug, run.ID, run.Level, dungeon.Slug),
			Dungeon: dungeon.Slug, Level: run.Level, Chests: run.Chests, ClearMS: run.ClearMS, TimerMS: run.TimerMS,
			TimeLeft: round1(timeLeft(run)), CompletedAt: run.CompletedAt, Region: run.Region, Group: runGroup(run), Video: run.Video,
		})
	}
	return response, nil
}
