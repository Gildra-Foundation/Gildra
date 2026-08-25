package main

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultURL = "https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv"

type asset struct {
	id         int64
	path, icon string
	hash       []byte
}

type byteCounter int64

func (counter *byteCounter) Write(payload []byte) (int, error) {
	*counter += byteCounter(len(payload))
	return len(payload), nil
}

func main() {
	if err := run(); err != nil {
		slog.Error("listfile import failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, sourceURL, buildVersion string
	var confirm bool
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&sourceURL, "url", defaultURL, "wow-listfile CSV release URL")
	flag.StringVar(&buildVersion, "version", "", "WoW build version (for example 12.1.0.69497)")
	flag.BoolVar(&confirm, "confirm", false, "download and import icon paths")
	flag.Parse()
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if !strings.HasPrefix(sourceURL, "https://github.com/wowdev/wow-listfile/") {
		return errors.New("url must be an official wowdev/wow-listfile GitHub release")
	}
	if !confirm {
		fmt.Printf("{\"dry_run\":true,\"source\":%q,\"version\":%q}\n", sourceURL, buildVersion)
		return nil
	}
	buildNumber, err := parseBuildNumber(buildVersion)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	releaseID, err := catalogimport.ReleaseIDFromEnvironment()
	if err != nil {
		return err
	}
	store := catalogimport.NewStore(db)
	ic, err := store.Begin(ctx, "wow", buildNumber, buildVersion, "us", "wow_listfile", releaseID, map[string]any{
		"source_url": sourceURL,
	})
	if err != nil {
		return fmt.Errorf("start listfile import: %w", err)
	}
	var seen, written int64
	importErr := error(nil)
	finished := false
	defer func() {
		if finished {
			return
		}
		status := "SUCCEEDED"
		if importErr != nil {
			status = "FAILED"
		}
		if finishErr := store.Finish(context.WithoutCancel(ctx), ic.RunID, status, seen, written, importErr); finishErr != nil {
			slog.Error("finish listfile import", "error", finishErr)
		}
	}()
	artifactID, err := store.RegisterPendingArtifact(ctx, ic, "wow_listfile", "community-listfile.csv", "", sourceURL, map[string]any{
		"build_version": buildVersion,
	})
	if err != nil {
		importErr = err
		return err
	}
	artifactFinished := false
	defer func() {
		if artifactFinished {
			return
		}
		cause := importErr
		if cause == nil {
			cause = errors.New("listfile import stopped before artifact verification")
		}
		if failErr := store.FailArtifact(context.WithoutCancel(ctx), artifactID, cause); failErr != nil {
			slog.Error("fail listfile artifact", "error", failErr)
		}
	}()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		importErr = err
		return err
	}
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		importErr = err
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		importErr = fmt.Errorf("listfile returned %s", resp.Status)
		return importErr
	}
	hasher := sha256.New()
	counter := byteCounter(0)
	reader := csv.NewReader(io.TeeReader(resp.Body, io.MultiWriter(hasher, &counter)))
	reader.Comma = ';'
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = true
	batch := make([]asset, 0, 3000)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		count, err := upsert(ctx, db, ic, artifactID, sourceURL, batch)
		written += count
		batch = batch[:0]
		return err
	}
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			importErr = err
			return err
		}
		if len(record) < 2 {
			continue
		}
		id, err := strconv.ParseInt(strings.TrimSpace(record[0]), 10, 64)
		if err != nil || id <= 0 {
			continue
		}
		path := strings.ReplaceAll(strings.TrimSpace(record[1]), "\\", "/")
		lower := strings.ToLower(path)
		if !strings.HasPrefix(lower, "interface/icons/") || filepath.Ext(lower) != ".blp" {
			continue
		}
		icon := strings.TrimSuffix(filepath.Base(lower), filepath.Ext(lower))
		digest := sha256.Sum256([]byte(path))
		batch = append(batch, asset{id: id, path: path, icon: icon, hash: digest[:]})
		seen++
		if len(batch) >= cap(batch) {
			if err := flush(); err != nil {
				importErr = err
				return err
			}
		}
	}
	if err := flush(); err != nil {
		importErr = err
		return err
	}
	if err := store.CompleteArtifact(ctx, artifactID, hasher.Sum(nil), int64(counter), resp.Header.Get("ETag")); err != nil {
		importErr = err
		return err
	}
	artifactFinished = true
	if err := store.Finish(ctx, ic.RunID, "SUCCEEDED", seen, written, nil); err != nil {
		importErr = fmt.Errorf("finish listfile snapshot: %w", err)
		return importErr
	}
	finished = true
	if releaseID == nil {
		if err := publishStandaloneAssets(ctx, db, ic.SnapshotID); err != nil {
			rollbackErr := store.Finish(context.WithoutCancel(ctx), ic.RunID, "FAILED", seen, written, err)
			return errors.Join(err, rollbackErr)
		}
	}
	slog.Info("listfile import completed", "seen", seen, "written", written)
	return nil
}

func parseBuildNumber(version string) (int, error) {
	parts := strings.Split(strings.TrimSpace(version), ".")
	if len(parts) != 4 {
		return 0, errors.New("-version must contain an exact four-part WoW build")
	}
	buildNumber := 0
	for index, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || (index == 0 && value == 0) || (index == 3 && value == 0) {
			return 0, fmt.Errorf("invalid WoW build version %q", version)
		}
		if index == 3 {
			buildNumber = value
		}
	}
	return buildNumber, nil
}

func upsert(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext, artifactID uuid.UUID, sourceURL string, rows []asset) (int64, error) {
	var affected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE file_asset_stage(file_data_id BIGINT,path TEXT,icon_name TEXT,content_hash BYTEA) ON COMMIT DROP`); err != nil {
			return err
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"file_asset_stage"}, []string{"file_data_id", "path", "icon_name", "content_hash"}, pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) { r := rows[i]; return []any{r.id, r.path, r.icon, r.hash}, nil }))
		if err != nil {
			return err
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO catalog_file_asset_versions(
				snapshot_id,file_data_id,path,icon_name,source_url,content_hash,source_artifact_id
			)
			SELECT $1,file_data_id,path,icon_name,$2,content_hash,$3 FROM file_asset_stage
			ON CONFLICT(snapshot_id,file_data_id) DO UPDATE SET
				path=EXCLUDED.path,
				icon_name=EXCLUDED.icon_name,
				source_url=EXCLUDED.source_url,
				content_hash=EXCLUDED.content_hash,
				source_artifact_id=EXCLUDED.source_artifact_id,
				imported_at=now()
			WHERE catalog_file_asset_versions.content_hash IS DISTINCT FROM EXCLUDED.content_hash
			   OR catalog_file_asset_versions.source_artifact_id IS DISTINCT FROM EXCLUDED.source_artifact_id`,
			ic.SnapshotID, sourceURL, artifactID)
		if err != nil {
			return err
		}
		affected = command.RowsAffected()
		return nil
	})
	return affected, err
}

func publishStandaloneAssets(ctx context.Context, db *pgxpool.Pool, snapshotID uuid.UUID) error {
	_, err := db.Exec(ctx, `
		INSERT INTO catalog_file_assets(
			file_data_id,path,icon_name,source_url,content_hash,snapshot_id,source_artifact_id,imported_at
		)
		SELECT file_data_id,path,icon_name,source_url,content_hash,snapshot_id,source_artifact_id,imported_at
		FROM catalog_file_asset_versions
		WHERE snapshot_id=$1
		ON CONFLICT(file_data_id) DO UPDATE SET
			path=EXCLUDED.path,
			icon_name=EXCLUDED.icon_name,
			source_url=EXCLUDED.source_url,
			content_hash=EXCLUDED.content_hash,
			snapshot_id=EXCLUDED.snapshot_id,
			source_artifact_id=EXCLUDED.source_artifact_id,
			imported_at=EXCLUDED.imported_at`, snapshotID)
	if err != nil {
		return fmt.Errorf("publish standalone listfile assets: %w", err)
	}
	return nil
}
