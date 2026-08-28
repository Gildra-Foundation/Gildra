package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	result, err := run()
	if result.RunID != 0 {
		_ = json.NewEncoder(os.Stdout).Encode(result)
	}
	if err != nil {
		slog.Error("catalog pipeline stopped", "error", err)
		os.Exit(1)
	}
}

func run() (catalogpipeline.Result, error) {
	var databaseURL, sources, mode, trigger, profile, product, version, binaryDirectory, publicationEnvironment, recoveryPolicy string
	var maxRecords int
	var confirmFullImport bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&profile, "profile", catalogpipeline.ProfileRetailFoundation, "catalog source profile: retail-foundation or custom")
	flag.StringVar(&sources, "sources", "", "optional comma-separated source stages; the profile default is used when empty")
	flag.StringVar(&mode, "mode", "dry_run", "dry_run or apply")
	flag.StringVar(&trigger, "trigger", "manual", "manual, schedule, or retry")
	flag.StringVar(&product, "product", "wow", "game product slug")
	flag.StringVar(&version, "version", "", "optional WoW build version")
	flag.StringVar(&binaryDirectory, "bin-dir", "", "directory containing importer executables")
	flag.StringVar(&publicationEnvironment, "publication-environment", "production", "development, staging, or production")
	flag.StringVar(&recoveryPolicy, "recovery-policy", catalogquality.RecoveryPolicyOffHost, "off_host or verified_same_host")
	flag.IntVar(&maxRecords, "max-records", 0, "records per source dataset; 0 imports all")
	flag.BoolVar(&confirmFullImport, "confirm-full-import", false, "confirm an unbounded production import")
	flag.DurationVar(&timeout, "timeout", 6*time.Hour, "whole pipeline timeout")
	flag.Parse()
	if databaseURL == "" {
		return catalogpipeline.Result{}, errors.New("DATABASE_URL or -database-url is required")
	}
	if mode != "dry_run" && mode != "apply" {
		return catalogpipeline.Result{}, errors.New("mode must be dry_run or apply")
	}
	if trigger != "manual" && trigger != "schedule" && trigger != "retry" {
		return catalogpipeline.Result{}, errors.New("trigger must be manual, schedule, or retry")
	}
	if publicationEnvironment != "development" && publicationEnvironment != "staging" && publicationEnvironment != "production" {
		return catalogpipeline.Result{}, errors.New("publication-environment must be development, staging, or production")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return catalogpipeline.Result{}, fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return catalogpipeline.Result{}, fmt.Errorf("ping catalog database: %w", err)
	}
	options := catalogpipeline.Options{
		PipelineKey: "catalog-refresh", Trigger: trigger, Mode: mode, Profile: strings.TrimSpace(profile), Product: strings.TrimSpace(product),
		Sources: catalogpipeline.SortedSources(sources), BuildVersion: strings.TrimSpace(version),
		MaxRecords: maxRecords, ConfirmFullImport: confirmFullImport, BinaryDirectory: strings.TrimSpace(binaryDirectory),
		PublicationEnvironment: publicationEnvironment,
		RecoveryPolicy:         strings.TrimSpace(recoveryPolicy),
	}
	return (&catalogpipeline.Runner{DB: db, Stdout: os.Stdout, Stderr: os.Stderr}).Run(ctx, options)
}
