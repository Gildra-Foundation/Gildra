//go:build integration

package catalog

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAchievementEmbeddedTargetsRespectPublication(t *testing.T) {
	url := os.Getenv("ACHIEVEMENT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires disposable real-source achievement fixture")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var id string
	var build int64
	if err := db.QueryRow(ctx, `SELECT e.id::text,v.build_id FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id JOIN game_builds b ON b.id=v.build_id WHERE e.entity_type='achievement' AND e.external_id=6 AND b.version LIKE 'achievement-rehearsal-%'`).Scan(&id, &build); err != nil {
		t.Fatal(err)
	}
	service := NewService(db)
	for _, test := range []struct {
		name, product, id string
		build             int64
		linked            bool
	}{
		{"published", "wow", id, build, true}, {"other build", "wow", id, build + 999, false}, {"other product", "wow_classic", id, build, false}, {"missing", "wow", "00000000-0000-0000-0000-000000000001", build, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			refs := []map[string]any{{"id": test.id, "name": "Level 10"}, {"id": test.id}, {"id": test.id}, {"id": test.id}}
			block := map[string]any{"type": "achievement_info", "criteria": map[string]any{"children": []any{map[string]any{"target": refs[0]}}}, "previous": refs[1], "next": []any{refs[2]}, "rewards": []any{refs[3]}}
			entity := &Entity{Product: test.product, Locale: "en_US", BuildID: &test.build, Tooltip: &Tooltip{Blocks: []map[string]any{block}}}
			if err := service.enrichAchievementTargets(ctx, []*Entity{entity}); err != nil {
				t.Fatal(err)
			}
			for _, ref := range refs {
				_, linked := ref["id"]
				if linked != test.linked {
					t.Fatalf("link=%v want %v", linked, test.linked)
				}
			}
			if refs[0]["name"] != "Level 10" {
				t.Fatal("lost source text")
			}
		})
	}
	// Retail quests without a decision are held, exactly as in Relationships.
	var quest string
	if err := db.QueryRow(ctx, `SELECT e.id::text FROM game_entities e JOIN game_entity_versions v ON v.id=e.published_version_id WHERE e.entity_type='quest' AND v.build_id=$1 AND NOT EXISTS(SELECT 1 FROM catalog_entity_usability u WHERE u.build_id=$1 AND u.entity_type='quest' AND u.external_id=e.external_id) LIMIT 1`, build).Scan(&quest); err != nil {
		t.Fatal(err)
	}
	ref := map[string]any{"id": quest}
	entity := &Entity{Product: "wow", Locale: "en_US", BuildID: &build, Tooltip: &Tooltip{Blocks: []map[string]any{{"type": "achievement_info", "rewards": []any{ref}}}}}
	if err := service.enrichAchievementTargets(ctx, []*Entity{entity}); err != nil {
		t.Fatal(err)
	}
	if _, ok := ref["id"]; ok {
		t.Fatal("unreviewed quest link exposed")
	}
}
