package catalogpipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
	"time"
)

func TestResumeRejectsUnknownStage(t *testing.T) {
	for _, options := range []Options{
		{ResumeFrom: "import-battleent"}, {ResumeStages: []string{"release-publish"}},
	} {
		options.Product = "wow"
		options.Mode = "apply"
		options.BuildVersion = "12.1.5.70783"
		options.ResumeReleaseID = "6d78e633-74be-463b-b41e-cfc8431163da"
		if _, err := BuildPlan(options); err == nil {
			t.Fatal("unsafe resume accepted")
		}
	}
}

// Explicit opt-in only: never inherit DATABASE_URL from a production shell.
func TestPostPublishRecoveryIntegration(t *testing.T) {
	url := os.Getenv("MIDNIGHT_D_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("isolated test database not configured")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := fmt.Sprintf("midnight_d_%d", time.Now().UnixNano())
	if _, err := db.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	isolated, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer isolated.Close()
	db = isolated
	exec := func(q string) {
		t.Helper()
		if _, err := db.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	// This test owns a fresh disposable database, not the application's schema.
	exec(`CREATE TABLE game_products(id smallint,slug text);
 CREATE TABLE game_builds(id bigint,product_id smallint,version text,is_active bool);
 INSERT INTO game_products VALUES(1,'wow'); INSERT INTO game_builds VALUES(92,1,'12.1.5.70783',true);
 CREATE TABLE catalog_pipeline_runs(id bigint,current_stage text);
 INSERT INTO catalog_pipeline_runs VALUES(1,'');
 CREATE TABLE catalog_pipeline_stages(run_id bigint,stage_key text,status text,started_at timestamptz,finished_at timestamptz,counters jsonb,error_code text,error_summary text);
 INSERT INTO catalog_pipeline_stages VALUES(1,'refresh-post-publish','queued',NULL,NULL,'{}','','');
 CREATE TABLE projection(value integer); INSERT INTO projection VALUES(7);
 CREATE TABLE fault(enabled bool); INSERT INTO fault VALUES(true);
 CREATE FUNCTION catalog_refresh_quest_usability(bigint) RETURNS void LANGUAGE SQL AS 'UPDATE projection SET value=8';
 CREATE FUNCTION refresh_catalog_read_models(smallint) RETURNS void LANGUAGE SQL AS 'UPDATE projection SET value=9';
 CREATE FUNCTION refresh_catalog_public_summary_stats(smallint) RETURNS void LANGUAGE SQL AS 'UPDATE projection SET value=10';
 CREATE FUNCTION refresh_catalog_published_source_dependencies() RETURNS void LANGUAGE SQL AS 'UPDATE projection SET value=11';
 CREATE FUNCTION refresh_catalog_library_datasets(smallint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF (SELECT enabled FROM fault) THEN RAISE EXCEPTION 'injected late projection failure'; END IF; UPDATE projection SET value=12; END $$;
 CREATE FUNCTION refresh_catalog_library_media_previews(smallint) RETURNS void LANGUAGE SQL AS 'UPDATE projection SET value=13';`)
	runner := Runner{DB: db}
	if err := runner.refreshPostPublish(ctx, 1, "wow", "12.1.5.70783"); err == nil {
		t.Fatal("expected late failure")
	}
	check := func(want int, status string) {
		t.Helper()
		var got int
		var state string
		if err := db.QueryRow(ctx, `SELECT value FROM projection`).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow(ctx, `SELECT status FROM catalog_pipeline_stages WHERE stage_key='refresh-post-publish'`).Scan(&state); err != nil {
			t.Fatal(err)
		}
		if got != want || state != status {
			t.Fatalf("value=%d status=%s want=%d/%s", got, state, want, status)
		}
	}
	check(7, "failed")
	exec(`UPDATE fault SET enabled=false`)
	for i := 0; i < 2; i++ {
		if err := runner.refreshPostPublish(ctx, 1, "wow", "12.1.5.70783"); err != nil {
			t.Fatal(err)
		}
		check(13, "succeeded")
	}
	// An unproven skipped source cannot be resumed; proof is release-specific.
	options := Options{ResumeReleaseID: "candidate", ResumeFrom: "import-battlenet"}
	plan := []Stage{{Key: "import-db2", Executable: "db2-import"}, {Key: "import-battlenet", Executable: "catalog-import"}}
	if err := runner.validateResumeEvidence(ctx, options, plan); err == nil {
		t.Fatal("missing source success accepted")
	}
	exec(`INSERT INTO catalog_pipeline_stages(run_id,stage_key,status,counters) VALUES(2,'release-start','succeeded','{"release_id":"candidate"}'),(2,'import-db2','succeeded','{}')`)
	if err := runner.validateResumeEvidence(ctx, options, plan); err != nil {
		t.Fatal(err)
	}
	options.ResumeReleaseID = "other"
	if err := runner.validateResumeEvidence(ctx, options, plan); err == nil {
		t.Fatal("cross-release proof accepted")
	}
	if err := runner.refreshPostPublish(ctx, 1, "wow", "12.1.5.70575"); err == nil {
		t.Fatal("inactive build accepted")
	}
	check(13, "failed")
}

func TestMidnightBackfillDryRunPlan(t *testing.T) {
	plan, err := BuildPlan(Options{Product: "wow", Mode: "dry_run", Profile: ProfileRetailFoundation, BuildVersion: "12.1.5.70783", PublicationEnvironment: "production", MaxRecords: 0})
	if err != nil {
		t.Fatal(err)
	}
	for _, stage := range plan {
		if stage.Key == "release-publish" || stage.Key == "release-start" {
			t.Fatal("dry-run can mutate release")
		}
	}
	if path := os.Getenv("MIDNIGHT_D_PLAN_PATH"); path != "" {
		data, err := json.MarshalIndent(plan, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}
