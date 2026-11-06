package gamemeta

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"time"
)

// ---- Season stats --------------------------------------------------------
//
// GET /v1/meta/wow/mythic-plus/stats summarizes the run sample (spec
// presence, dungeons, compositions) and passes through what describes the
// whole rated population: rating cutoffs per region and the world, and the
// rating cohorts of every specialization.

// RunsSampleDepth is how deep each region's leaderboards were read.
type RunsSampleDepth struct {
	PageSize int            `json:"page_size"`
	Pages    map[string]int `json:"pages"`
}

// CohortSet is one region's (or the world's) rating cohorts per specialization.
type CohortSet struct {
	UpdatedAt string `json:"updated_at"`
	// Day of the last weekly point of every spec's trend.
	TrendEnd string       `json:"trend_end"`
	Specs    []CohortSpec `json:"specs"`
}

// CohortSpec is one specialization's rated characters: how many, how many
// reach the region's top 0.1% (the title range) and the spec's own cutoffs.
type CohortSpec struct {
	ID         int     `json:"id"`
	Population int     `json:"population"`
	Title      int     `json:"title"`
	P01        float64 `json:"p01"`
	P1         float64 `json:"p1"`
	P10        float64 `json:"p10"`
	// Weekly top-1% rating of the spec, oldest first, ending at TrendEnd.
	Trend []float64 `json:"trend"`
}

// PresenceDay is one day of spec presence in the sample: runs and runs with
// each spec per region. The scraper carries the list from one snapshot to the next.
type PresenceDay struct {
	Date  string                    `json:"date"`
	Runs  map[string]int            `json:"runs"`
	Specs map[string]map[string]int `json:"specs"`
}

// DungeonStats summarizes one dungeon of the filtered runs.
type DungeonStats struct {
	Slug string `json:"slug"`
	RunStats
	// Runs at the dungeon's highest key and the best time left among them.
	RunsAtMax    int          `json:"runsAtMax"`
	BestTimeLeft float64      `json:"bestTimeLeft"`
	Levels       []LevelCount `json:"levels"`
	Standout     *SpecLift    `json:"standout,omitempty"`
}

// SpecLift is the spec a dungeon favours most: the highest ratio of its presence
// there to its presence across all dungeons (among specs in at least 10% of the runs).
type SpecLift struct {
	Spec     int     `json:"spec"`
	Presence float64 `json:"presence"`
	Overall  float64 `json:"overall"`
	Lift     float64 `json:"lift"`
}

// SpecPresence is how often a spec appears in the filtered runs.
type SpecPresence struct {
	Spec        int     `json:"spec"`
	Role        string  `json:"role"`
	Runs        int     `json:"runs"`
	Presence    float64 `json:"presence"`
	MedianLevel float64 `json:"medianLevel"`
	// Change of presence in percentage points against the sample about a week
	// earlier; absent until the history covers a week or under a dungeon/level filter.
	Delta *float64 `json:"delta,omitempty"`
}

// LevelCount is the number of runs at one key level.
type LevelCount struct {
	Level int `json:"level"`
	Runs  int `json:"runs"`
}

// CompDiversity tells how concentrated the compositions of the sample are.
type CompDiversity struct {
	Comps      int     `json:"comps"`
	Specs      int     `json:"specs"`
	TopShare   float64 `json:"topShare"`
	Top10Share float64 `json:"top10Share"`
	// Effective number of compositions (inverse Simpson index).
	Effective float64       `json:"effective"`
	Top       []Composition `json:"top"`
}

// CohortView is the spec cohorts of one region or of the world.
type CohortView struct {
	Region     string           `json:"region"`
	UpdatedAt  string           `json:"updatedAt"`
	TrendEnd   string           `json:"trendEnd"`
	Population int              `json:"population"`
	Title      int              `json:"title"`
	Specs      []CohortSpecView `json:"specs"`
}

// CohortSpecView is one spec of a CohortView with shares and the weekly change.
type CohortSpecView struct {
	Spec            int       `json:"spec"`
	Role            string    `json:"role"`
	Population      int       `json:"population"`
	PopulationShare float64   `json:"populationShare"`
	Title           int       `json:"title"`
	TitleShare      float64   `json:"titleShare"`
	P01             float64   `json:"p01"`
	P1              float64   `json:"p1"`
	P10             float64   `json:"p10"`
	Trend           []float64 `json:"trend"`
	Delta           *float64  `json:"delta,omitempty"`
}

// StatsResponse is GET /v1/meta/wow/mythic-plus/stats.
type StatsResponse struct {
	RunsEnvelope
	Overall   RunStats                   `json:"overall"`
	Dungeons  []DungeonStats             `json:"dungeonStats"`
	Specs     []SpecPresence             `json:"specPresence"`
	Levels    []LevelCount               `json:"levels"`
	Cutoffs   map[string]json.RawMessage `json:"cutoffs"`
	World     json.RawMessage            `json:"worldCutoffs,omitempty"`
	Diversity CompDiversity              `json:"diversity"`
	Cohorts   *CohortView                `json:"cohorts,omitempty"`
	// Runs read per dungeon from each region's leaderboard.
	Depth map[string]int `json:"depth"`
}

const (
	standoutMinPresence = 10.0
	standoutMinRuns     = 10
	presenceDeltaDays   = 6
)

// Stats summarizes the filtered runs (specs filter ignored) and passes the cutoffs through.
func (s *RunsSnapshot) Stats(filter RunsFilter) (StatsResponse, error) {
	filter.Specs = nil
	dungeonID, err := s.validate(&filter)
	if err != nil {
		return StatsResponse{}, err
	}
	runs := s.filtered(filter, dungeonID)
	response := StatsResponse{RunsEnvelope: s.envelope(filter, runs), Cutoffs: s.Payload.Cutoffs, World: s.Payload.WorldCutoffs}
	if response.Cutoffs == nil {
		response.Cutoffs = map[string]json.RawMessage{}
	}
	overall := statsAccumulator{}
	perSpec := map[int]*statsAccumulator{}
	levels := map[int]int{}
	for _, run := range runs {
		overall.add(run)
		levels[run.Level]++
		for _, spec := range distinctSpecs(run) {
			if perSpec[spec] == nil {
				perSpec[spec] = &statsAccumulator{}
			}
			perSpec[spec].add(run)
		}
	}
	response.Overall = overall.stats()
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
	if filter.Dungeon == "" && filter.MinLevel == 0 {
		s.addPresenceDeltas(response.Specs, filter.Region)
	}
	// Dungeons are compared with each other, so they ignore the dungeon filter
	// (the page highlights the chosen one) and keep the region and level filters.
	field := runs
	if dungeonID != 0 {
		scope := filter
		scope.Dungeon = ""
		field = s.filtered(scope, 0)
	}
	response.Dungeons = s.dungeonStats(field)
	response.Levels = levelCounts(levels)
	response.Diversity = diversity(runs)
	response.Cohorts = s.cohortView(filter.Region)
	response.Depth = map[string]int{}
	for region, pages := range s.Payload.Sample.Pages {
		if pages > 0 && (filter.Region == "" || filter.Region == region) {
			response.Depth[region] = pages * s.Payload.Sample.PageSize
		}
	}
	return response, nil
}

func (s *RunsSnapshot) dungeonStats(runs []Run) []DungeonStats {
	perDungeon := map[int]*dungeonAccumulator{}
	specRuns := map[int]int{}
	for _, run := range runs {
		if perDungeon[run.Dungeon] == nil {
			perDungeon[run.Dungeon] = newDungeonAccumulator()
		}
		perDungeon[run.Dungeon].add(run)
		for _, spec := range distinctSpecs(run) {
			specRuns[spec]++
		}
	}
	presence := map[int]float64{}
	for spec, count := range specRuns {
		presence[spec] = float64(count) / float64(len(runs)) * 100
	}
	list := []DungeonStats{}
	for _, dungeon := range s.Payload.Dungeons {
		if acc := perDungeon[dungeon.ID]; acc != nil {
			list = append(list, acc.summary(dungeon.Slug, presence))
		}
	}
	return list
}

func distinctSpecs(run Run) []int {
	slots := runGroup(run).slots()
	list := make([]int, 0, 5)
	for index, spec := range slots {
		duplicate := false
		for _, earlier := range slots[:index] {
			if earlier == spec {
				duplicate = true
				break
			}
		}
		if !duplicate {
			list = append(list, spec)
		}
	}
	return list
}

func levelCounts(levels map[int]int) []LevelCount {
	list := make([]LevelCount, 0, len(levels))
	for level, count := range levels {
		list = append(list, LevelCount{Level: level, Runs: count})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Level < list[j].Level })
	return list
}

type dungeonAccumulator struct {
	stats  statsAccumulator
	runs   []Run
	levels map[int]int
	specs  map[int]int
}

func newDungeonAccumulator() *dungeonAccumulator {
	return &dungeonAccumulator{levels: map[int]int{}, specs: map[int]int{}}
}

func (a *dungeonAccumulator) add(run Run) {
	a.stats.add(run)
	a.runs = append(a.runs, run)
	a.levels[run.Level]++
	for _, spec := range distinctSpecs(run) {
		a.specs[spec]++
	}
}

func (a *dungeonAccumulator) summary(slug string, overall map[int]float64) DungeonStats {
	stats := a.stats.stats()
	result := DungeonStats{Slug: slug, RunStats: stats, Levels: levelCounts(a.levels)}
	for _, run := range a.runs {
		if run.Level != stats.MaxLevel {
			continue
		}
		result.RunsAtMax++
		if left := round1(timeLeft(run)); left > result.BestTimeLeft {
			result.BestTimeLeft = left
		}
	}
	for spec, count := range a.specs {
		here := float64(count) / float64(len(a.runs)) * 100
		base := overall[spec]
		if count < standoutMinRuns || here < standoutMinPresence || base <= 0 {
			continue
		}
		lift := here / base
		if result.Standout == nil || lift > result.Standout.Lift || (lift == result.Standout.Lift && spec < result.Standout.Spec) {
			result.Standout = &SpecLift{Spec: spec, Presence: round1(here), Overall: round1(base), Lift: lift}
		}
	}
	if result.Standout != nil {
		result.Standout.Lift = math.Round(result.Standout.Lift*100) / 100
	}
	return result
}

func diversity(runs []Run) CompDiversity {
	counts := map[string]int{}
	specs := map[int]bool{}
	for _, run := range runs {
		counts[runGroup(run).key()]++
		for _, spec := range runGroup(run).slots() {
			specs[spec] = true
		}
	}
	result := CompDiversity{Comps: len(counts), Specs: len(specs), Top: []Composition{}}
	if len(runs) == 0 {
		return result
	}
	shares := make([]int, 0, len(counts))
	simpson := 0.0
	for _, count := range counts {
		shares = append(shares, count)
		p := float64(count) / float64(len(runs))
		simpson += p * p
	}
	sort.Sort(sort.Reverse(sort.IntSlice(shares)))
	top10 := 0
	for index, count := range shares {
		if index >= 10 {
			break
		}
		top10 += count
	}
	result.TopShare = percentOf(shares[0], len(runs))
	result.Top10Share = percentOf(top10, len(runs))
	result.Effective = round1(1 / simpson)
	top := compositions(runs)
	if len(top) > 3 {
		top = top[:3]
	}
	result.Top = top
	return result
}

// addPresenceDeltas compares presence with the history day closest to a week
// before the newest one (same region scope as the current filter).
func (s *RunsSnapshot) addPresenceDeltas(specs []SpecPresence, region string) {
	history := s.Payload.PresenceHistory
	if len(history) < 2 {
		return
	}
	newest, err := time.Parse("2006-01-02", history[len(history)-1].Date)
	if err != nil {
		return
	}
	var then *PresenceDay
	for index := len(history) - 2; index >= 0; index-- {
		day, err := time.Parse("2006-01-02", history[index].Date)
		if err == nil && newest.Sub(day) >= presenceDeltaDays*24*time.Hour {
			then = &history[index]
			break
		}
	}
	if then == nil {
		return
	}
	total := 0
	counts := map[string]int{}
	for scope, runs := range then.Runs {
		if region != "" && scope != region {
			continue
		}
		total += runs
		for spec, count := range then.Specs[scope] {
			counts[spec] += count
		}
	}
	if total == 0 {
		return
	}
	for index := range specs {
		before := float64(counts[strconv.Itoa(specs[index].Spec)]) / float64(total) * 100
		delta := round1(specs[index].Presence - before)
		specs[index].Delta = &delta
	}
}

// cohortView picks the region's cohorts (the world's without a region filter)
// and adds shares and the weekly change of the top-1% rating.
func (s *RunsSnapshot) cohortView(region string) *CohortView {
	scope := region
	if scope == "" {
		scope = "world"
	}
	set, ok := s.Payload.SpecCohorts[scope]
	if !ok || len(set.Specs) == 0 {
		return nil
	}
	view := &CohortView{Region: scope, UpdatedAt: set.UpdatedAt, TrendEnd: set.TrendEnd, Specs: []CohortSpecView{}}
	for _, spec := range set.Specs {
		view.Population += spec.Population
		view.Title += spec.Title
	}
	for _, spec := range set.Specs {
		known, ok := s.specs[spec.ID]
		if !ok {
			continue
		}
		item := CohortSpecView{
			Spec: spec.ID, Role: known.Role, Population: spec.Population, PopulationShare: percentOf(spec.Population, view.Population),
			Title: spec.Title, TitleShare: percentOf(spec.Title, view.Title), P01: spec.P01, P1: spec.P1, P10: spec.P10, Trend: spec.Trend,
		}
		if item.Trend == nil {
			item.Trend = []float64{}
		}
		if n := len(spec.Trend); n >= 2 {
			delta := round1(spec.Trend[n-1] - spec.Trend[n-2])
			item.Delta = &delta
		}
		view.Specs = append(view.Specs, item)
	}
	sort.SliceStable(view.Specs, func(i, j int) bool { return view.Specs[i].P1 > view.Specs[j].P1 })
	return view
}
