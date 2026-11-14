package catalogtaxonomy

import (
	"strings"
	"testing"
)

// Every projected statement reads the build set as one array, evaluated once
// per statement: an IN over projectionBuilds let the planner rescan all
// versions of the build for each outer row.
func TestProjectionSQLReadsScopeOnce(t *testing.T) {
	sql := projectionSQL(`SELECT v.id FROM game_entity_versions v WHERE v.build_id IN ({projection_builds})`)
	if strings.Contains(sql, "{projection_builds}") || strings.Contains(sql, "build_id IN (SELECT build.id") {
		t.Fatalf("scope is not an array: %s", sql)
	}
	if got := strings.Count(sql, "current_setting('"+BuildsSetting+"',true)"); got != 4 {
		t.Fatalf("cached scope referenced %d times, want 4: %s", got, sql)
	}
	if !strings.Contains(sql, "candidate.build_id=ANY(") || !strings.Contains(sql, "SELECT unnest(") {
		t.Fatalf("unexpected scope form: %s", sql)
	}
}
