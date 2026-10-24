package gamemeta

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
	"time"
)

func TestSourceQueryUsesActualSliceTimestamp(t *testing.T) {
	url := os.Getenv("MVP_META_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("isolated meta database not configured")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// This opt-in integration test uses its own disposable database, never production.
	now := time.Date(2026, 10, 19, 10, 0, 0, 0, time.UTC)
	dataset, run, snapshot := uuid.New(), uuid.New(), uuid.New()
	_, err = db.Exec(ctx, `INSERT INTO datasets(id,slug,name,source_name) VALUES($1,'tierlist-wowhead','Wowhead','Wowhead')`, dataset)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.Exec(ctx, `UPDATE datasets SET current_snapshot_id=NULL WHERE id=$1`, dataset)
		_, _ = db.Exec(ctx, `DELETE FROM dataset_snapshots WHERE dataset_id=$1`, dataset)
		_, _ = db.Exec(ctx, `DELETE FROM dataset_runs WHERE dataset_id=$1`, dataset)
		_, _ = db.Exec(ctx, `DELETE FROM datasets WHERE id=$1`, dataset)
	}()
	_, err = db.Exec(ctx, `INSERT INTO dataset_runs(id,dataset_id,run_key,trigger,scheduled_for,status) VALUES($1,$2,'test','seed',CURRENT_DATE,'succeeded')`, run, dataset)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"pages": []map[string]any{
		{"activity": "mythic_plus", "role": "dps", "spec_count": 27, "source_url": "https://www.wowhead.com/guide/classes/tier-lists/dps-rankings-mythic-plus", "season_id": "midnight-season-2", "game_version": "12.1.5", "fetched_at": now.Add(-40 * time.Hour).Format(time.RFC3339)},
		{"activity": "mythic_plus", "role": "tank", "spec_count": 6, "season_id": "midnight-season-2", "fetched_at": now.Add(-time.Hour).Format(time.RFC3339)},
	}})
	_, err = db.Exec(ctx, `INSERT INTO dataset_snapshots(id,dataset_id,run_id,source_fetched_at,content_hash,page_count,record_count,unique_spec_count,payload) VALUES($1,$2,$3,$4,$5,2,33,33,$6)`, snapshot, dataset, run, now, make([]byte, 32), payload)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `UPDATE datasets SET current_snapshot_id=$2,last_success_at=$3 WHERE id=$1`, dataset, snapshot, now)
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(db)
	service.now = func() time.Time { return now }
	sources, stamp, err := service.sources(ctx, Query{Activity: "mythic_plus", Role: "dps", AddonKey: "midnight"})
	if err != nil {
		t.Fatal(err)
	}
	if len(sources) != 1 || sources[0].Status != "stale" || !stamp.Equal(now.Add(-40*time.Hour)) || sources[0].SeasonID != "midnight-season-2" {
		t.Fatalf("wrong provenance: %+v %v", sources, stamp)
	}
	tanks, _, err := service.sources(ctx, Query{Activity: "mythic_plus", Role: "tank", AddonKey: "midnight"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tanks) != 1 || tanks[0].Status != "live" {
		t.Fatalf("wrong tank slice: %+v", tanks)
	}
	missing, _, err := service.sources(ctx, Query{Activity: "raid", Role: "dps", AddonKey: "midnight"})
	if err != nil {
		t.Fatal(err)
	}
	if len(missing) != 0 {
		t.Fatal("unrelated source leaked into empty rating")
	}
	if _, err = service.WoWTierListContexts(ctx, "mythic_plus"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.WoWTierList(ctx, Query{Activity: "mythic_plus", Role: "dps", Limit: 40}); err != ErrSnapshotNotFound {
		t.Fatalf("empty snapshot: %v", err)
	}
	pages := []map[string]any{}
	for _, activity := range []string{"mythic_plus", "raid"} {
		for _, role := range []string{"dps", "tank", "healer"} {
			pages = append(pages, map[string]any{"activity": activity, "role": role, "spec_count": 1, "season_id": "midnight-season-2", "fetched_at": now.Add(-time.Hour).Format(time.RFC3339), "source_url": "https://www.wowhead.com/guide/classes/tier-lists/" + role + "-" + activity})
			_, err = db.Exec(ctx, `INSERT INTO tierlist_entries(snapshot_id,activity,role,tier,rank_in_tier,class_name,class_slug,spec_name,spec_slug,badge_slug,guide_id,guide_url,source_url,description,description_paragraphs,description_markup,content_hash) VALUES($1,$2,$3,'A',1,'Test','warrior','Test','arms','arms-warrior',1,'https://www.wowhead.com/guide/classes/warrior/arms','https://www.wowhead.com/guide/classes/tier-lists/test',repeat('test ',25),ARRAY['test'],'', $4)`, snapshot, activity, role, make([]byte, 32))
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	payload, _ = json.Marshal(map[string]any{"pages": pages})
	if _, err = db.Exec(ctx, `UPDATE dataset_snapshots SET payload=$2 WHERE id=$1`, snapshot, payload); err != nil {
		t.Fatal(err)
	}
	for _, activity := range []string{"mythic_plus", "raid"} {
		for _, role := range []string{"dps", "tank", "healer"} {
			result, err := service.WoWTierList(ctx, Query{Activity: activity, Role: role, Limit: 40})
			if err != nil {
				t.Fatal(activity, role, err)
			}
			if len(result.Entries) != 1 || result.Entries[0].Role != role || len(result.Sources) != 1 || result.SeasonID != "midnight-season-2" || result.Status != "live" {
				t.Fatalf("wrong slice %s/%s: %+v", activity, role, result)
			}
			if result.Entries[0].Score != nil || result.Entries[0].MaxKey != nil {
				t.Fatal("missing metrics were fabricated")
			}
		}
	}
}
