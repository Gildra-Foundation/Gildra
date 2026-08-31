package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogquality"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL string
	var input catalogquality.MeasurementInput
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&input.Product, "product", "wow", "game product slug")
	flag.StringVar(&input.BuildVersion, "build", "", "build version; defaults to the active/latest build")
	flag.StringVar(&input.ScopeKey, "scope", "", "stable completeness scope key")
	flag.StringVar(&input.EntityType, "entity-type", "", "catalog entity type")
	flag.StringVar(&input.Locale, "locale", "", "optional en_US or ru_RU locale")
	flag.StringVar(&input.Source, "source", "", "registered source policy key")
	flag.StringVar(&input.CountMode, "count-mode", "entities", "entities, documents, icons, media, or quest_registry")
	flag.Int64Var(&input.ExpectedCount, "expected", -1, "expected source count")
	flag.BoolVar(&input.Record, "record", false, "persist the expectation and measurement")
	flag.DurationVar(&timeout, "timeout", 2*time.Minute, "operation timeout")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if input.ExpectedCount < 0 {
		return errors.New("-expected is required and cannot be negative")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	measurement, err := catalogquality.Measure(ctx, db, input)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(measurement)
}
