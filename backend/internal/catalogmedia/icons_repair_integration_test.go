//go:build integration

package catalogmedia

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestIconRepairExpiredSameBytesAndPublishedBuild(t *testing.T) {
	ctx := context.Background()
	container, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23",
		pgcontainer.WithDatabase("gildra"),
		pgcontainer.WithUsername("gildra"),
		pgcontainer.WithPassword("test-password"),
		pgcontainer.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	databaseURL, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../../migrations/postgres")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	var productID int16
	if err := database.QueryRowContext(ctx, `SELECT id FROM game_products WHERE slug='wow'`).Scan(&productID); err != nil {
		t.Fatal(err)
	}
	var buildID int64
	if err := database.QueryRowContext(ctx, `
		INSERT INTO game_builds(product_id,build_number,version,is_active)
		VALUES($1,9999999,'99.0.0.9999999',true) RETURNING id`, productID).Scan(&buildID); err != nil {
		t.Fatal(err)
	}
	var snapshotID, artifactID uuid.UUID
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_snapshots(product_id,build_id,source,status,validated_at,published_at,metadata)
		VALUES($1,$2,'wago_tools','published',now(),now(),'{}') RETURNING id`, productID, buildID).Scan(&snapshotID); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `
		INSERT INTO catalog_source_artifacts(
			snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status
		) VALUES($1,$2,'wago_tools','shared-icon-source','https://wago.tools/test',
			decode(repeat('ab',32),'hex'),1,'ready') RETURNING id`, snapshotID, buildID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	for index, externalID := range []int64{700001, 700002} {
		var entityID, versionID uuid.UUID
		if err := database.QueryRowContext(ctx, `
			INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			VALUES($1,'spell',$2,$3,$4,$4) RETURNING id`, productID, externalID,
			fmt.Sprintf("shared-icon-spell-%d", index), buildID).Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		if err := database.QueryRowContext(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
			VALUES($1,$2,digest($3,'sha256'),'{}','https://wago.tools/test',$4,$5,'wago_tools') RETURNING id`,
			entityID, buildID, fmt.Sprintf("spell-%d", externalID), snapshotID, artifactID).Scan(&versionID); err != nil {
			t.Fatal(err)
		}
		if _, err := database.ExecContext(ctx, `UPDATE game_entities SET latest_version_id=$2,published_version_id=$2 WHERE id=$1`, entityID, versionID); err != nil {
			t.Fatal(err)
		}
		if _, err := database.ExecContext(ctx, `
			INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id,file_data_id,asset_source_artifact_id)
			VALUES($1,'spell',$2,'spell_fire_flamebolt',$3,135812,$3)`, buildID, externalID, artifactID); err != nil {
			t.Fatal(err)
		}
	}

	png := validTestPNG(t)
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		if !strings.HasPrefix(request.URL.String(), "https://render.worldofwarcraft.com/eu/icons/56/") {
			t.Fatalf("unexpected icon URL %q", request.URL.String())
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(png)), Header: make(http.Header)}, nil
	})}
	cache, err := New(pool, t.TempDir(), "https://api.wowarcana.com", client)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cache.Close() })
	result, err := cache.SeedOfficialIcons(ctx, IconSeedOptions{Product: "wow", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 1 || result.IconsCached != 1 || result.Entities != 2 || result.Failed != 0 || calls != 1 {
		t.Fatalf("icon seed result=%#v calls=%d, want one download linked to two entities", result, calls)
	}
	result, err = cache.SeedOfficialIcons(ctx, IconSeedOptions{Product: "wow", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if result.Eligible != 0 || result.IconsCached != 0 || result.Entities != 0 || calls != 1 {
		t.Fatalf("repeat icon seed result=%#v calls=%d, want no remaining work", result, calls)
	}

	if _, err := database.ExecContext(ctx, `INSERT INTO game_builds(product_id,build_number,version,is_active) VALUES($1,99999999,'future',false)`, productID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()-interval '40 days',cached_url=replace(cached_url,'api.wowarcana.com','api.gildra.net')`); err != nil {
		t.Fatal(err)
	}
	plan, err := cache.SeedOfficialIcons(ctx, IconSeedOptions{Product: "wow", Limit: 10, MissingOnly: true, PlanOnly: true})
	if err != nil || plan.Eligible != 1 || calls != 1 {
		t.Fatalf("plan=%+v err=%v calls=%d", plan, err, calls)
	}
	repaired, err := cache.SeedOfficialIcons(ctx, IconSeedOptions{Product: "wow", BuildID: buildID, Limit: 10, MissingOnly: true})
	if err != nil || repaired.Entities != 2 || calls != 2 {
		t.Fatalf("repair=%+v err=%v calls=%d", repaired, err, calls)
	}
	again, err := cache.SeedOfficialIcons(ctx, IconSeedOptions{Product: "wow", Limit: 10, MissingOnly: true})
	if err != nil || again.Eligible != 0 || calls != 2 {
		t.Fatalf("repeat=%+v err=%v calls=%d", again, err, calls)
	}
	// Whole-catalog renewal uses the source window with ten days of headroom.
	if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()-interval '21 days'`); err != nil {
		t.Fatal(err)
	}
	options := RefreshOptions{Product: "wow", Environment: "staging", Limit: 2000, BatchSize: 1, HeadroomDays: 10, Interval: 100 * time.Millisecond, Checkpoint: filepath.Join(t.TempDir(), "cursor.json"), PlanOnly: true}
	renewal, err := cache.RefreshIcons(ctx, options)
	if err != nil || renewal.Downloads != 1 || renewal.Rows != 2 || renewal.ByType["spell"] != 2 || calls != 2 {
		t.Fatalf("renewal plan=%+v err=%v calls=%d", renewal, err, calls)
	}
	if _, err := os.Stat(options.Checkpoint); !os.IsNotExist(err) {
		t.Fatal("plan wrote checkpoint")
	}
	options.PlanOnly = false
	renewal, err = cache.RefreshIcons(ctx, options)
	if err != nil || renewal.Entities != 2 || renewal.IconsCached != 1 || renewal.Batches != 1 || calls != 3 {
		t.Fatalf("renewal=%+v err=%v calls=%d", renewal, err, calls)
	}
	var observations int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_entity_media`).Scan(&observations); err != nil || observations != 2 {
		t.Fatalf("same bytes duplicated observations=%d err=%v", observations, err)
	}
	renewal, err = cache.RefreshIcons(ctx, options)
	if err != nil || renewal.Downloads != 0 || calls != 3 {
		t.Fatalf("restart=%+v err=%v calls=%d", renewal, err, calls)
	}
	// Cancel after one committed batch, then resume with the durable cursor.
	if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_icons SET icon_name='spell_frost_frostbolt02' WHERE external_id=700002; UPDATE catalog_entity_media SET cached_at=now()-interval '40 days'`); err != nil {
		t.Fatal(err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	options.Progress = func(RefreshResult) { cancel() }
	partial, err := cache.RefreshIcons(cancelled, options)
	if err == nil || partial.Batches != 1 || partial.Entities != 1 {
		t.Fatalf("interrupted=%+v err=%v", partial, err)
	}
	options.Progress = nil
	resumed, err := cache.RefreshIcons(ctx, options)
	if err != nil || resumed.Downloads != 1 || resumed.Entities != 1 {
		t.Fatalf("resumed=%+v err=%v", resumed, err)
	}
	// The same bytes under a newer artifact (an earlier cohort repair) must not
	// move a record off its own observation, and unchanged bytes add neither a
	// media row nor a snapshot.
	if _, err := database.ExecContext(ctx, `
		WITH snapshot AS (
			INSERT INTO catalog_snapshots(product_id,build_id,source,status,content_hash,validated_at,published_at,metadata)
			VALUES($1,$2,'blizzard_api','published','later-repair',now(),now(),'{}') RETURNING id
		)
		INSERT INTO catalog_source_artifacts(snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status,fetched_at)
		SELECT snapshot.id,$2,'blizzard_api',artifact.artifact_key,artifact.source_url,artifact.content_hash,artifact.byte_size,'ready',now()+interval '1 hour'
		FROM catalog_source_artifacts artifact,snapshot
		WHERE artifact.build_id=$2 AND artifact.source='blizzard_api' AND artifact.artifact_key='icons/56/spell_fire_flamebolt.jpg'`,
		productID, buildID); err != nil {
		t.Fatal(err)
	}
	expire := func() {
		t.Helper()
		if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()-interval '40 days'`); err != nil {
			t.Fatal(err)
		}
	}
	counts := func() (media, snapshots int) {
		t.Helper()
		if err := database.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM catalog_entity_media),(SELECT count(*) FROM catalog_snapshots)`).Scan(&media, &snapshots); err != nil {
			t.Fatal(err)
		}
		return media, snapshots
	}
	expire()
	if _, err := database.ExecContext(ctx, `UPDATE catalog_source_artifacts SET fetched_at=now()-interval '40 days' WHERE source='blizzard_api' AND fetched_at<=now()`); err != nil {
		t.Fatal(err)
	}
	mediaBefore, snapshotsBefore := counts()
	inPlace, err := cache.RefreshIcons(ctx, options)
	if err != nil || inPlace.IconsCached != 2 || inPlace.Entities != 2 || inPlace.RowsInserted != 0 {
		t.Fatalf("in-place renewal=%+v err=%v", inPlace, err)
	}
	if media, snapshots := counts(); media != mediaBefore || snapshots != snapshotsBefore {
		t.Fatalf("unchanged bytes wrote media %d->%d snapshots %d->%d", mediaBefore, media, snapshotsBefore, snapshots)
	}
	var staleProofs int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_source_artifacts WHERE source='blizzard_api' AND fetched_at<now()-interval '1 minute'`).Scan(&staleProofs); err != nil || staleProofs != 0 {
		t.Fatalf("re-proved artifacts left stale=%d err=%v", staleProofs, err)
	}

	// Changed bytes are a new observation; the previous one is kept.
	changed := append(append([]byte{}, png...), 0)
	cache.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		data := png
		if strings.HasSuffix(request.URL.Path, "/spell_fire_flamebolt.jpg") {
			data = changed
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(data)), Header: make(http.Header)}, nil
	})}
	expire()
	replaced, err := cache.RefreshIcons(ctx, options)
	if err != nil || replaced.Entities != 2 || replaced.RowsInserted != 1 {
		t.Fatalf("changed bytes renewal=%+v err=%v", replaced, err)
	}
	if media, _ := counts(); media != mediaBefore+1 {
		t.Fatalf("changed bytes media rows=%d, want %d", media, mediaBefore+1)
	}

	// An icon no source serves is reported, tolerated below the failure
	// threshold, and left out of the next runs until the retry window passes.
	cache.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host == "wago.tools" {
			return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
		}
		if strings.Contains(request.URL.Path, "spell_frost_frostbolt02") || request.URL.Host != "render.worldofwarcraft.com" {
			return &http.Response{StatusCode: http.StatusForbidden, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(changed)), Header: make(http.Header)}, nil
	})}
	expire()
	options.RetryFailedAfter = 72 * time.Hour
	failing, err := cache.RefreshIcons(ctx, options)
	if err != nil || failing.Failed != 1 || failing.IconsCached != 1 || len(failing.FailureSample) != 1 {
		t.Fatalf("failing renewal=%+v err=%v", failing, err)
	}
	options.PlanOnly = true
	deferred, err := cache.RefreshIcons(ctx, options)
	if err != nil || deferred.DeferredFailures != 1 || deferred.Downloads != 0 {
		t.Fatalf("deferred plan=%+v err=%v", deferred, err)
	}
	options.RetryFailedAfter = 0
	retried, err := cache.RefreshIcons(ctx, options)
	if err != nil || retried.DeferredFailures != 0 || retried.Downloads != 1 {
		t.Fatalf("retry plan=%+v err=%v", retried, err)
	}
	options.PlanOnly = false

	// A throttling render host stops the run; its answers are not recorded as
	// failures and the icons stay due.
	previousBackoff, previousLimit := throttleBackoff, refreshTroubleLimit
	throttleBackoff, refreshTroubleLimit = time.Millisecond, 2
	t.Cleanup(func() { throttleBackoff, refreshTroubleLimit = previousBackoff, previousLimit })
	cache.client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusTooManyRequests, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	})}
	expire()
	throttled, err := cache.RefreshIcons(ctx, options)
	if err == nil || !strings.Contains(err.Error(), "throttled") || throttled.SourceTrouble != 2 || throttled.Failed != 0 || throttled.IconsCached != 0 {
		t.Fatalf("throttled renewal=%+v err=%v", throttled, err)
	}
	options.PlanOnly = true
	stillDue, err := cache.RefreshIcons(ctx, options)
	if err != nil || stillDue.Downloads != 2 || stillDue.DeferredFailures != 0 {
		t.Fatalf("after throttling plan=%+v err=%v", stillDue, err)
	}
	cache.client = client
	if _, err := database.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()`); err != nil {
		t.Fatal(err)
	}
	// Real SQL backfill: only same-build proven map references are eligible.
	for _, row := range []struct {
		table   string
		id      int
		payload string
	}{
		{"Map", 8000, `{"ExpansionID":"11"}`},
		{"Map", 8001, `{"ExpansionID":"10"}`},
		{"AreaTable", 9000, `{"ContinentID":"8000"}`},
		{"AreaTable", 9001, `{"ContinentID":"8001"}`},
		{"JournalInstance", 9002, `{"MapID":"8000"}`},
	} {
		if _, err := database.ExecContext(ctx, `INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload,content_hash,source_url,source_artifact_id) VALUES($1,$2,'en_US',$3,$4::jsonb,digest($4::text,'sha256'),'https://wago.tools/test',$5)`, buildID, row.table, row.id, row.payload, artifactID); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile("../../scripts/midnight-membership.sql")
	if err != nil {
		t.Fatal(err)
	}
	query := string(raw)
	query = query[strings.Index(query, "WITH proven AS"):]
	parts := strings.SplitN(query, "\\if :apply", 2)
	query = parts[0] + strings.SplitN(parts[1], "\\else", 2)[0] + ";"
	query = strings.ReplaceAll(query, ":build_id", strconv.FormatInt(buildID, 10))
	for attempt := 0; attempt < 2; attempt++ {
		if _, err := database.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	var confirmed int
	if err := database.QueryRowContext(ctx, `SELECT count(*) FROM catalog_entity_expansions WHERE build_id=$1 AND entity_type IN('area','instance') AND classification='confirmed'`, buildID).Scan(&confirmed); err != nil || confirmed != 2 {
		t.Fatalf("membership count=%d err=%v", confirmed, err)
	}

}
