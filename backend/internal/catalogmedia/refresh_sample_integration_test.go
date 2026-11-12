//go:build integration

package catalogmedia

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// An explicit opt-in: real source names and real network requests, isolated DB
// and directory. Names are exported read-only from the published build.
func TestRefreshRealIconSample(t *testing.T) {
	input := os.Getenv("MEDIA_REAL_ICON_SAMPLE")
	if input == "" {
		t.Skip("set MEDIA_REAL_ICON_SAMPLE to an exported 2000-icon JSON array")
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var sample []struct {
		Name       string `json:"icon_name"`
		FileDataID *int64 `json:"file_data_id"`
	}
	if err = json.Unmarshal(raw, &sample); err != nil {
		t.Fatal(err)
	}
	fanout, _ := strconv.Atoi(os.Getenv("MEDIA_REAL_ICON_FANOUT"))
	if fanout < 0 || fanout > 1000000 {
		t.Fatal("invalid fanout")
	}
	if len(sample) != 2000 && !(len(sample) == 1 && fanout > 0) {
		t.Fatalf("expected 2000 real icons, got %d", len(sample))
	}
	ctx := context.Background()
	container, err := pgcontainer.Run(ctx, "postgres:17.10-alpine3.23", pgcontainer.WithDatabase("gildra"), pgcontainer.WithUsername("gildra"), pgcontainer.WithPassword("test-password"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_ = goose.SetDialect("postgres")
	migrations, _ := filepath.Abs("../../migrations/postgres")
	if err = goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db.SetMaxOpenConns(1)
	setup := `INSERT INTO game_builds(id,product_id,build_number,version,is_active) OVERRIDING SYSTEM VALUE VALUES(92,1,69587,'12.1.0.69587',true);
 CREATE TEMP TABLE sample_icons AS SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(icon_name text,file_data_id bigint);
 INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
 SELECT 1,'spell',row_number() OVER(ORDER BY icon_name),'sample-'||icon_name,92,92 FROM sample_icons;
 INSERT INTO catalog_snapshots(id,product_id,build_id,source,status,metadata,validated_at,published_at)
 VALUES('00000000-0000-0000-0000-000000000092',1,92,'wago_tools','published','{}',now(),now());
 INSERT INTO catalog_source_artifacts(id,snapshot_id,build_id,source,artifact_key,source_url,content_hash,byte_size,status)
 VALUES('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000092',92,'wago_tools','sample','https://wago.tools/test',digest('sample','sha256'),1,'ready');
 INSERT INTO game_entity_versions(entity_id,build_id,content_hash,payload,source_url,snapshot_id,source_artifact_id,source)
 SELECT id,92,digest(canonical_slug,'sha256'),'{}','https://wago.tools/test','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000093','wago_tools' FROM game_entities WHERE first_seen_build_id=92;
 ANALYZE game_entities; ANALYZE game_entity_versions;
 UPDATE game_entities e SET published_version_id=v.id,latest_version_id=v.id FROM game_entity_versions v WHERE v.entity_id=e.id;
 INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,file_data_id,source_artifact_id)
 SELECT 92,'spell',e.external_id,s.icon_name,s.file_data_id,'00000000-0000-0000-0000-000000000093'
 FROM sample_icons s JOIN game_entities e ON e.canonical_slug='sample-'||s.icon_name;
 ANALYZE`
	if fanout > 0 {
		setup = strings.Replace(setup, "INSERT INTO game_entity_versions", `INSERT INTO game_entities(product_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
   SELECT 1,'spell',20000000+n,'fanout-'||n,92,92 FROM generate_series(1,`+strconv.Itoa(fanout-1)+`) n;
   INSERT INTO game_entity_versions`, 1)
		setup = strings.Replace(setup, "e.canonical_slug='sample-'||s.icon_name", "(e.canonical_slug='sample-'||s.icon_name OR e.canonical_slug LIKE 'fanout-%')", 1)
	}
	for _, statement := range strings.Split(setup, ";") {
		var args []any
		if strings.Contains(statement, "$1") {
			args = []any{string(raw)}
		}
		if _, err = db.ExecContext(ctx, statement, args...); err != nil {
			t.Fatal(err)
		}
	}
	root := t.TempDir()
	cache, err := New(pool, root, "https://api.wowarcana.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cache.Close()
	interval := 500 * time.Millisecond
	if value := os.Getenv("MEDIA_REAL_ICON_INTERVAL"); value != "" {
		if interval, err = time.ParseDuration(value); err != nil {
			t.Fatal(err)
		}
	}
	options := RefreshOptions{Product: "wow", Environment: "staging", BuildID: 92, Limit: 2000, BatchSize: 100, HeadroomDays: 10, Interval: interval, Checkpoint: filepath.Join(root, "cursor.json"), PlanOnly: true}
	plan, err := cache.RefreshIcons(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(plan)
	t.Logf("PLAN %s", encoded)
	options.PlanOnly = false
	options.Progress = func(r RefreshResult) {
		t.Logf("BATCH %d icons=%d failed=%d rows=%d bytes=%d seconds=%.2f", r.Batches, r.IconsCached, r.Failed, r.Entities, r.Bytes, r.ElapsedSeconds)
	}
	var beforeBytes int64
	var beforeWAL string
	_ = db.QueryRow(`SELECT pg_database_size(current_database()),pg_current_wal_lsn()::text`).Scan(&beforeBytes, &beforeWAL)
	result, runErr := cache.RefreshIcons(ctx, options)
	encoded, _ = json.Marshal(result)
	t.Logf("MEASURED %s err=%v", encoded, runErr)
	var diskBytes int64
	var files int
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err == nil && info.Mode().IsRegular() {
			diskBytes += info.Size()
			files++
		}
		return err
	})
	var mediaRows, artifacts, snapshots int64
	_ = db.QueryRow(`SELECT count(*) FROM catalog_entity_media`).Scan(&mediaRows)
	_ = db.QueryRow(`SELECT count(*) FROM catalog_source_artifacts WHERE artifact_key<>'sample'`).Scan(&artifacts)
	_ = db.QueryRow(`SELECT count(*) FROM catalog_snapshots WHERE id<>'00000000-0000-0000-0000-000000000092'`).Scan(&snapshots)
	var afterBytes, walBytes int64
	_ = db.QueryRow(`SELECT pg_database_size(current_database()),pg_wal_lsn_diff(pg_current_wal_lsn(),$1::pg_lsn)::bigint`, beforeWAL).Scan(&afterBytes, &walBytes)
	t.Logf("DB size delta %d WAL %d", afterBytes-beforeBytes, walBytes)
	t.Logf("WRITES media=%d artifacts=%d snapshots=%d files=%d diskBytes=%d", mediaRows, artifacts, snapshots, files, diskBytes)
	if result.IconsCached == 0 {
		t.Fatal("no real icons fetched")
	}
	// Failures are measured outcomes, not fake successful assets. A resumed run
	// must plan only the remaining failures, never the committed successes.
	options.PlanOnly = true
	remaining, err := cache.RefreshIcons(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	if remaining.Downloads != result.Failed {
		t.Fatalf("resume planned %d, failures %d", remaining.Downloads, result.Failed)
	}
	if os.Getenv("MEDIA_REAL_ICON_RENEW") == "" {
		return
	}
	// A later cycle: every icon is due again and the hosts return the same
	// bytes, so the pass must renew rows in place rather than add any.
	if _, err = db.ExecContext(ctx, `UPDATE catalog_entity_media SET cached_at=now()-interval '21 days'`); err != nil {
		t.Fatal(err)
	}
	_ = db.QueryRow(`SELECT pg_database_size(current_database()),pg_current_wal_lsn()::text`).Scan(&beforeBytes, &beforeWAL)
	options.PlanOnly = false
	renewed, renewErr := cache.RefreshIcons(ctx, options)
	encoded, _ = json.Marshal(renewed)
	t.Logf("RENEWED %s err=%v", encoded, renewErr)
	var renewedRows int64
	_ = db.QueryRow(`SELECT count(*) FROM catalog_entity_media`).Scan(&renewedRows)
	_ = db.QueryRow(`SELECT pg_database_size(current_database()),pg_wal_lsn_diff(pg_current_wal_lsn(),$1::pg_lsn)::bigint`, beforeWAL).Scan(&afterBytes, &walBytes)
	t.Logf("RENEWAL DB size delta %d WAL %d media rows %d->%d inserted=%d", afterBytes-beforeBytes, walBytes, mediaRows, renewedRows, renewed.RowsInserted)
}
