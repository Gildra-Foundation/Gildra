package gamemeta

import (
	"testing"
	"time"
)

func TestRankingFreshnessAndCompatibleMetrics(t *testing.T) {
	now := time.Date(2026, 10, 19, 9, 0, 0, 0, time.UTC)
	old, fresh := now.Add(-48*time.Hour), now.Add(-time.Hour)
	score := 95.0
	base := Snapshot{Sources: []Source{
		{Slug: "tierlist-wowhead", UpdatedAt: &old, SeasonID: "midnight-season-2"},
		{Slug: "tierlist-wowgg", UpdatedAt: &fresh, SeasonID: "midnight-season-2"},
	}, Entries: []Entry{{Score: &score}}}
	result := finishSnapshot(base, now)
	if result.Status != "stale" || !result.UpdatedAt.Equal(old) {
		t.Fatalf("unrelated freshness hid old ranking: %+v", result)
	}
	if result.Entries[0].Score == nil || len(result.Sources) != 2 {
		t.Fatal("compatible real metrics were lost")
	}
}

func TestUnknownSeasonNeverMixesMetrics(t *testing.T) {
	now := time.Now().UTC()
	score := 99.0
	for _, season := range []string{"", "midnight-season-1"} {
		result := finishSnapshot(Snapshot{Sources: []Source{
			{Slug: "tierlist-wowhead", UpdatedAt: &now, SeasonID: "midnight-season-2"},
			{Slug: "tierlist-wowgg", UpdatedAt: &now, SeasonID: season},
		}, Entries: []Entry{{Score: &score}}}, now)
		if result.Entries[0].Score != nil || len(result.Sources) != 1 {
			t.Fatalf("unverified metrics leaked: %+v", result)
		}
	}
}

func TestFreshnessBoundaryAndMissingTimestamp(t *testing.T) {
	now := time.Now().UTC()
	for _, test := range []struct {
		age  time.Duration
		want string
	}{{36 * time.Hour, "live"}, {36*time.Hour + time.Second, "stale"}, {-time.Hour, "stale"}} {
		stamp := now.Add(-test.age)
		result := finishSnapshot(Snapshot{Sources: []Source{{Slug: "tierlist-wowhead", UpdatedAt: &stamp}}}, now)
		if result.Status != test.want {
			t.Fatalf("age %s: %s", test.age, result.Status)
		}
	}
	result := finishSnapshot(Snapshot{Sources: []Source{{Slug: "tierlist-wowhead"}}}, now)
	if result.Status != "stale" || !result.UpdatedAt.IsZero() {
		t.Fatal("missing timestamp fabricated freshness")
	}
}
