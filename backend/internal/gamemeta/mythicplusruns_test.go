package gamemeta

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Spec ids: tanks 250 (Blood), 104 (Guardian); healers 65 (Holy Paladin), 264 (Resto Shaman);
// DPS 62 (Arcane), 71 (Arms), 262 (Elemental), 259 (Assassination).
func testRunsSnapshot() *RunsSnapshot {
	payload := &RunsPayload{
		SchemaVersion: 1,
		Season:        RunsSeason{Slug: "season-mn-2", Name: "MN Season 2"},
		Dungeons: []RunsDungeon{
			{ID: 586, Slug: "den-of-nalorakk", Name: "Den of Nalorakk", TimerMS: 1_920_000},
			{ID: 587, Slug: "murder-row", Name: "Murder Row", TimerMS: 2_040_000},
		},
		Specs: []RunsSpec{
			{ID: 250, Role: "tank"}, {ID: 104, Role: "tank"},
			{ID: 65, Role: "healer"}, {ID: 264, Role: "healer"},
			{ID: 62, Role: "dps"}, {ID: 71, Role: "dps"}, {ID: 262, Role: "dps"}, {ID: 259, Role: "dps"},
		},
		Regions: []string{"us", "eu"},
		Cutoffs: map[string]json.RawMessage{"eu": json.RawMessage(`{"tiers":[{"key":"p990","score":3874.8}]}`)},
	}
	id := int64(1)
	add := func(count, dungeon, level, chests int, clear int64, region string, tank, healer int, dps [3]int, at string) {
		for range count {
			payload.Runs = append(payload.Runs, Run{ID: id, Dungeon: dungeon, Level: level, Chests: chests, ClearMS: clear, TimerMS: 2_000_000,
				CompletedAt: at, Region: region, Tank: tank, Healer: healer, DPS: dps})
			id++
		}
	}
	add(30, 586, 22, 1, 1_800_000, "eu", 250, 65, [3]int{62, 71, 262}, "2026-11-01T10:00:00Z")
	add(10, 586, 24, 2, 1_500_000, "us", 104, 264, [3]int{62, 62, 259}, "2026-11-03T10:00:00Z")
	add(25, 587, 20, 1, 1_900_000, "eu", 250, 65, [3]int{62, 71, 262}, "2026-10-20T10:00:00Z")
	add(2, 587, 21, 3, 1_000_000, "us", 104, 65, [3]int{71, 259, 262}, "2026-10-25T10:00:00Z")
	return NewRunsSnapshot(payload)
}

func TestCompsCountExactGroupsAndHideTinySamples(t *testing.T) {
	response, err := testRunsSnapshot().Comps(RunsFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if response.Sample.Runs != 67 || response.Sample.MinLevel != 20 || response.Sample.MaxLevel != 24 {
		t.Fatalf("sample = %#v", response.Sample)
	}
	if response.Levels != (LevelRange{Min: 20, Max: 24}) {
		t.Fatalf("level range = %#v", response.Levels)
	}
	if len(response.Compositions) != 2 {
		t.Fatalf("compositions = %d, want 2 (the two-run group is below the minimum sample)", len(response.Compositions))
	}
	top := response.Compositions[0]
	if top.Tank != 250 || top.Runs != 55 || top.MaxLevel != 22 || top.Dungeons != 2 || top.MedianLevel != 22 {
		t.Fatalf("top composition = %#v", top)
	}
	if top.Share != 82.1 {
		t.Fatalf("share = %v", top.Share)
	}
}

func TestCompsFilterByDungeonLevelAndSpecs(t *testing.T) {
	snapshot := testRunsSnapshot()
	response, err := snapshot.Comps(RunsFilter{Dungeon: "den-of-nalorakk", MinLevel: 23})
	if err != nil {
		t.Fatal(err)
	}
	if response.Sample.Runs != 10 || response.Compositions[0].UpgradeShare != 100 || response.Compositions[0].MedianTimeLeft != 25 {
		t.Fatalf("filtered = %#v / %#v", response.Sample, response.Compositions)
	}
	// Two Arcane Mages: only the group that brought both matches.
	response, err = snapshot.Comps(RunsFilter{Specs: []int{62, 62}})
	if err != nil {
		t.Fatal(err)
	}
	if response.Sample.Runs != 10 {
		t.Fatalf("double Arcane runs = %d", response.Sample.Runs)
	}
}

func TestFillSuggestsOnlyOpenSlots(t *testing.T) {
	response, err := testRunsSnapshot().Comps(RunsFilter{Specs: []int{250, 62}})
	if err != nil {
		t.Fatal(err)
	}
	fill := response.Fill
	if fill.Matched != 55 || fill.Open["tank"] != 0 || fill.Open["dps"] != 2 {
		t.Fatalf("fill = %#v", fill)
	}
	if len(fill.Candidates["tank"]) != 0 {
		t.Fatalf("tank slot is filled but got %#v", fill.Candidates["tank"])
	}
	dps := fill.Candidates["dps"]
	if len(dps) != 2 || dps[0].Runs != 55 || dps[0].Share != 100 {
		t.Fatalf("dps candidates = %#v", dps)
	}
	for _, candidate := range dps {
		if candidate.Spec == 62 {
			t.Fatal("the chosen Arcane slot was offered again")
		}
	}
}

func TestCompsRejectImpossibleGroups(t *testing.T) {
	snapshot := testRunsSnapshot()
	for _, filter := range []RunsFilter{
		{Specs: []int{250, 104}},
		{Specs: []int{62, 62, 71, 259}},
		{Specs: []int{999}},
	} {
		if _, err := snapshot.Comps(filter); err != ErrInvalidSpecs {
			t.Fatalf("%v: err = %v", filter.Specs, err)
		}
	}
	if _, err := snapshot.Comps(RunsFilter{Dungeon: "atal-dazar"}); err != ErrUnknownDungeon {
		t.Fatalf("unknown dungeon err = %v", err)
	}
}

func TestStatsAreConsistentWithTheSample(t *testing.T) {
	response, err := testRunsSnapshot().Stats(RunsFilter{Region: "eu"})
	if err != nil {
		t.Fatal(err)
	}
	if response.Sample.Runs != 55 || response.Overall.Runs != 55 {
		t.Fatalf("sample = %#v overall = %#v", response.Sample, response.Overall)
	}
	total := 0
	for _, dungeon := range response.Dungeons {
		total += dungeon.Runs
	}
	if total != response.Sample.Runs {
		t.Fatalf("dungeon runs add up to %d, want %d", total, response.Sample.Runs)
	}
	levelTotal := 0
	for _, level := range response.Levels {
		levelTotal += level.Runs
	}
	if levelTotal != response.Sample.Runs {
		t.Fatalf("level histogram adds up to %d", levelTotal)
	}
	for _, spec := range response.Specs {
		if spec.Presence > 100 || spec.Runs > response.Sample.Runs {
			t.Fatalf("spec presence out of bounds: %#v", spec)
		}
	}
	if string(response.Cutoffs["eu"]) == "" {
		t.Fatal("cutoffs were not passed through")
	}
}

func TestRunsSortAndLinkOut(t *testing.T) {
	snapshot := testRunsSnapshot()
	response, err := snapshot.Runs(RunsFilter{}, "level", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Runs) != 3 || response.Sample.Runs != 67 || response.Runs[0].Level != 24 {
		t.Fatalf("runs = %#v", response.Runs)
	}
	if want := "https://raider.io/mythic-plus-runs/season-mn-2/"; !strings.HasPrefix(response.Runs[0].URL, want) || !strings.HasSuffix(response.Runs[0].URL, "-24-den-of-nalorakk") {
		t.Fatalf("url = %s", response.Runs[0].URL)
	}
	fast, _ := snapshot.Runs(RunsFilter{}, "fast", 1)
	if fast.Runs[0].Chests != 3 || fast.Runs[0].TimeLeft != 50 {
		t.Fatalf("fastest = %#v", fast.Runs[0])
	}
	recent, _ := snapshot.Runs(RunsFilter{}, "recent", 1)
	if recent.Runs[0].CompletedAt != "2026-11-03T10:00:00Z" {
		t.Fatalf("recent = %#v", recent.Runs[0])
	}
}

func TestPairsNeedASampleAndBeatChance(t *testing.T) {
	for _, pair := range pairs(testRunsSnapshot().Payload.Runs) {
		if pair.Runs < pairMinSample || pair.Lift <= 1 {
			t.Fatalf("pair %#v should have been hidden", pair)
		}
	}
}

func TestMythicPlusRunsEndpoints(t *testing.T) {
	store := &fakeStore{runs: testRunsSnapshot()}
	store.runs.Status = "live"
	store.runs.FetchedAt = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	mux := http.NewServeMux()
	NewHandler(store).Register(mux)
	for _, test := range []struct {
		target string
		want   int
	}{
		{"/v1/meta/wow/mythic-plus/comps", http.StatusOK},
		{"/v1/meta/wow/mythic-plus/comps?dungeon=murder-row&minLevel=20&specs=250,65", http.StatusOK},
		{"/v1/meta/wow/mythic-plus/stats?region=eu", http.StatusOK},
		{"/v1/meta/wow/mythic-plus/runs?sort=fast&limit=5&specs=62", http.StatusOK},
		{"/v1/meta/wow/mythic-plus/comps?dungeon=Bad_Slug", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/comps?dungeon=atal-dazar", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/comps?specs=250,104", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/comps?specs=a,b", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/stats?region=cn", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/runs?minLevel=99", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/runs?sort=random", http.StatusBadRequest},
		{"/v1/meta/wow/mythic-plus/runs?limit=500", http.StatusBadRequest},
	} {
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.target, nil))
		if response.Code != test.want {
			t.Fatalf("%s: status = %d, want %d: %s", test.target, response.Code, test.want, response.Body.String())
		}
		if test.want == http.StatusOK && response.Header().Get("Cache-Control") != publicMetaCache {
			t.Fatalf("%s: Cache-Control = %q", test.target, response.Header().Get("Cache-Control"))
		}
	}
}

func TestMythicPlusRunsMapsMissingSnapshot(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(&fakeStore{err: ErrSnapshotNotFound}).Register(mux)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/meta/wow/mythic-plus/stats", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestRunsFreshness(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	fresh, old := now.Add(-13*time.Hour), now.Add(-31*time.Hour)
	if freshness(&fresh, now, mythicPlusRunsStaleAfter) != "live" || freshness(&old, now, mythicPlusRunsStaleAfter) != "stale" {
		t.Fatal("freshness thresholds are wrong")
	}
}

func TestStatsDungeonsDiversityAndCohorts(t *testing.T) {
	snapshot := testRunsSnapshot()
	snapshot.Payload.Sample = RunsSampleDepth{PageSize: 20, Pages: map[string]int{"us": 15, "eu": 15, "kr": 0}}
	snapshot.Payload.SpecCohorts = map[string]CohortSet{
		"world": {TrendEnd: "2026-11-06", Specs: []CohortSpec{
			{ID: 71, Population: 300, Title: 30, P01: 4100, P1: 3900, P10: 3400, Trend: []float64{3700, 3850, 3900}},
			{ID: 62, Population: 100, Title: 10, P01: 4000, P1: 3800, P10: 3300, Trend: []float64{3800}},
			{ID: 9999, Population: 50, Title: 5, P01: 1, P1: 1, P10: 1},
		}},
	}
	snapshot.Payload.PresenceHistory = []PresenceDay{
		{Date: "2026-10-30", Runs: map[string]int{"eu": 10, "us": 10}, Specs: map[string]map[string]int{"eu": {"71": 10}, "us": {"71": 0}}},
		{Date: "2026-11-05", Runs: map[string]int{"eu": 1}, Specs: map[string]map[string]int{"eu": {"71": 1}}},
		{Date: "2026-11-06", Runs: map[string]int{"eu": 55}, Specs: map[string]map[string]int{"eu": {"71": 55}}},
	}
	response, err := snapshot.Stats(RunsFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if response.Depth["us"] != 300 || response.Depth["eu"] != 300 || len(response.Depth) != 2 {
		t.Fatalf("depth = %#v", response.Depth)
	}
	if response.Diversity.Comps != 3 || response.Diversity.TopShare != 82.1 || len(response.Diversity.Top) != 2 {
		t.Fatalf("diversity = %#v", response.Diversity)
	}
	den := response.Dungeons[0]
	if den.Slug != "den-of-nalorakk" || den.MaxLevel != 24 || den.RunsAtMax != 10 || den.BestTimeLeft != 25 || len(den.Levels) != 2 {
		t.Fatalf("den = %#v", den)
	}
	// 264 is in 10 of 40 runs here (25%) and 10 of 67 overall: the spec this dungeon favours most.
	if den.Standout == nil || den.Standout.Spec != 264 || den.Standout.Presence != 25 {
		t.Fatalf("standout = %#v", den.Standout)
	}
	for _, spec := range response.Specs {
		if spec.Spec == 71 {
			// 57 of 67 runs now against 10 of 20 a week before.
			if spec.Delta == nil || *spec.Delta != round1(57.0/67*100-50) {
				t.Fatalf("arms delta = %v", spec.Delta)
			}
		}
	}
	if response.Cohorts == nil || response.Cohorts.Region != "world" || len(response.Cohorts.Specs) != 2 || response.Cohorts.Title != 45 {
		t.Fatalf("cohorts = %#v", response.Cohorts)
	}
	arms := response.Cohorts.Specs[0]
	if arms.Spec != 71 || arms.Role != "dps" || arms.Delta == nil || *arms.Delta != 50 || arms.TitleShare != 66.7 {
		t.Fatalf("arms cohort = %#v", arms)
	}
	if response.Cohorts.Specs[1].Delta != nil {
		t.Fatal("a one-point trend has no weekly change")
	}
	filtered, err := snapshot.Stats(RunsFilter{Dungeon: "murder-row", Region: "eu"})
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered.Dungeons) != 2 || filtered.Sample.Runs != 25 {
		t.Fatalf("dungeons keep the region scope and ignore the dungeon filter: %d dungeons, %d runs", len(filtered.Dungeons), filtered.Sample.Runs)
	}
	if filtered.Cohorts != nil {
		t.Fatal("no eu cohorts in the payload: the view must be absent")
	}
	for _, spec := range filtered.Specs {
		if spec.Delta != nil {
			t.Fatal("presence change is only shown without a dungeon filter")
		}
	}
}
