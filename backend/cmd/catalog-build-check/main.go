package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
	"github.com/jackc/pgx/v5/pgxpool"
)

type result struct {
	Source       string `json:"source"`
	CurrentBuild string `json:"current_build"`
	RemoteBuild  string `json:"remote_build"`
	Update       bool   `json:"update_available"`
}

func main() {
	changed, err := run()
	if err != nil {
		slog.Error("catalog build check failed", "error", err)
		os.Exit(255)
	}
	if !changed {
		os.Exit(1)
	}
}

func run() (bool, error) {
	var databaseURL, product, table, locale string
	var requireUpdate bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&product, "product", "wow", "game product slug")
	flag.StringVar(&table, "table", "ItemSparse", "small canonical DB2 table used for the build HEAD check")
	flag.StringVar(&locale, "locale", "enUS", "Wago locale used for the build HEAD check")
	flag.BoolVar(&requireUpdate, "require-update", false, "return exit code 1 when the active build is already current")
	flag.DurationVar(&timeout, "timeout", 90*time.Second, "remote build-check timeout")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return false, errors.New("DATABASE_URL or -database-url is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return false, fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	remoteBuild, err := wago.New(wago.Config{RetryMax: 2, RetryDelay: time.Second}).CurrentBuild(ctx, table, locale)
	if err != nil {
		return false, err
	}
	var productID int16
	var currentBuild string
	if err := db.QueryRow(ctx, `
		SELECT product.id,COALESCE(build.version,'')
		FROM game_products product
		LEFT JOIN LATERAL (
			SELECT candidate.version FROM game_builds candidate
			WHERE candidate.product_id=product.id AND candidate.is_active
			ORDER BY candidate.build_number DESC LIMIT 1
		) build ON true
		WHERE product.slug=$1`, product).Scan(&productID, &currentBuild); err != nil {
		return false, fmt.Errorf("load active catalog build: %w", err)
	}
	remoteNumber, err := parseBuildNumber(remoteBuild)
	if err != nil {
		return false, err
	}
	changed := currentBuild != remoteBuild
	status := "current"
	if changed {
		status = "update_available"
	}
	hash := sha256.Sum256([]byte(remoteBuild))
	if _, err := db.Exec(ctx, `
		INSERT INTO catalog_build_update_checks(product_id,source,channel,observed_build,observed_build_number,manifest_hash,status,metadata,checked_at)
		VALUES($1,'wago_tools','live',$2,$3,$4,$5,jsonb_build_object('table',$6::text,'locale',$7::text),now())
		ON CONFLICT(product_id,source,channel) DO UPDATE SET observed_build=EXCLUDED.observed_build,
			observed_build_number=EXCLUDED.observed_build_number,manifest_hash=EXCLUDED.manifest_hash,
			status=EXCLUDED.status,metadata=EXCLUDED.metadata,checked_at=EXCLUDED.checked_at`,
		productID, remoteBuild, remoteNumber, hash[:], status, table, locale); err != nil {
		return false, fmt.Errorf("record catalog build check: %w", err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result{Source: "wago_tools", CurrentBuild: currentBuild, RemoteBuild: remoteBuild, Update: changed}); err != nil {
		return false, fmt.Errorf("encode build check: %w", err)
	}
	if !changed && !requireUpdate {
		return true, nil
	}
	return changed, nil
}

func parseBuildNumber(version string) (int64, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	value, err := strconv.ParseInt(parts[3], 10, 64)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return value, nil
}
