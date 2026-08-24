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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultURL = "https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv"

type asset struct {
	id         int64
	path, icon string
	hash       []byte
}

func main() {
	if err := run(); err != nil {
		slog.Error("listfile import failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, sourceURL string
	var confirm bool
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&sourceURL, "url", defaultURL, "wow-listfile CSV release URL")
	flag.BoolVar(&confirm, "confirm", false, "download and import icon paths")
	flag.Parse()
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if !strings.HasPrefix(sourceURL, "https://github.com/wowdev/wow-listfile/") {
		return errors.New("url must be an official wowdev/wow-listfile GitHub release")
	}
	if !confirm {
		fmt.Printf("{\"dry_run\":true,\"source\":%q}\n", sourceURL)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("listfile returned %s", resp.Status)
	}
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	reader := csv.NewReader(resp.Body)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = true
	batch := make([]asset, 0, 3000)
	var seen, written int64
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		count, err := upsert(ctx, db, sourceURL, batch)
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
				return err
			}
		}
	}
	if err := flush(); err != nil {
		return err
	}
	slog.Info("listfile import completed", "seen", seen, "written", written)
	return nil
}

func upsert(ctx context.Context, db *pgxpool.Pool, sourceURL string, rows []asset) (int64, error) {
	var affected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE file_asset_stage(file_data_id BIGINT,path TEXT,icon_name TEXT,content_hash BYTEA) ON COMMIT DROP`); err != nil {
			return err
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"file_asset_stage"}, []string{"file_data_id", "path", "icon_name", "content_hash"}, pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) { r := rows[i]; return []any{r.id, r.path, r.icon, r.hash}, nil }))
		if err != nil {
			return err
		}
		command, err := tx.Exec(ctx, `INSERT INTO catalog_file_assets(file_data_id,path,icon_name,source_url,content_hash) SELECT file_data_id,path,icon_name,$1,content_hash FROM file_asset_stage ON CONFLICT(file_data_id) DO UPDATE SET path=EXCLUDED.path,icon_name=EXCLUDED.icon_name,source_url=EXCLUDED.source_url,content_hash=EXCLUDED.content_hash,imported_at=now() WHERE catalog_file_assets.content_hash IS DISTINCT FROM EXCLUDED.content_hash`, sourceURL)
		if err != nil {
			return err
		}
		affected = command.RowsAffected()
		return nil
	})
	return affected, err
}
