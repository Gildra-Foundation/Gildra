package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"filippo.io/age"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogbackup"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var product, prefix, temporaryDirectory string
	var timeout time.Duration
	var preflight bool
	flag.StringVar(&product, "product", "wow", "game product slug recorded with the backup")
	flag.StringVar(&prefix, "object-prefix", "catalog-backups", "clean relative object-store prefix")
	flag.StringVar(&temporaryDirectory, "temp-directory", "", "directory for the encrypted temporary archive")
	flag.DurationVar(&timeout, "timeout", 2*time.Hour, "whole backup and restore-verification timeout")
	flag.BoolVar(&preflight, "preflight", false, "validate backup configuration without accessing databases or object storage")
	flag.Parse()
	if timeout <= 0 {
		return errors.New("timeout must be positive")
	}
	preflightEnvironment, err := boolEnvironment("CATALOG_BACKUP_PREFLIGHT", false)
	if err != nil {
		return err
	}
	preflight = preflight || preflightEnvironment

	identity, err := age.ParseX25519Identity(strings.TrimSpace(os.Getenv("CATALOG_BACKUP_AGE_IDENTITY")))
	if err != nil {
		return fmt.Errorf("parse CATALOG_BACKUP_AGE_IDENTITY: %w", err)
	}
	recipient, err := age.ParseX25519Recipient(strings.TrimSpace(os.Getenv("CATALOG_BACKUP_AGE_RECIPIENT")))
	if err != nil {
		return fmt.Errorf("parse CATALOG_BACKUP_AGE_RECIPIENT: %w", err)
	}
	signingKey, err := catalogbackup.ParseSigningKey(strings.TrimSpace(os.Getenv("CATALOG_BACKUP_SIGNING_KEY")))
	if err != nil {
		return fmt.Errorf("parse CATALOG_BACKUP_SIGNING_KEY: %w", err)
	}
	pathStyle, err := boolEnvironment("CATALOG_BACKUP_S3_PATH_STYLE", true)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	store, err := catalogbackup.NewS3Store(ctx, catalogbackup.S3Config{
		Endpoint: os.Getenv("CATALOG_BACKUP_S3_ENDPOINT"), Region: os.Getenv("CATALOG_BACKUP_S3_REGION"),
		Bucket: os.Getenv("CATALOG_BACKUP_S3_BUCKET"), AccessKeyID: os.Getenv("CATALOG_BACKUP_S3_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("CATALOG_BACKUP_S3_SECRET_ACCESS_KEY"),
		URIScheme:       environmentOr("CATALOG_BACKUP_URI_SCHEME", "s3"), UsePathStyle: pathStyle,
	})
	if err != nil {
		return err
	}
	sourceDatabaseURL := os.Getenv("DATABASE_URL")
	restoreDatabaseURL := os.Getenv("CATALOG_BACKUP_RESTORE_DATABASE_URL")
	options := catalogbackup.Options{
		SourceDatabaseURL: sourceDatabaseURL, RestoreDatabaseURL: restoreDatabaseURL,
		Product: strings.TrimSpace(product), ObjectPrefix: strings.TrimSpace(prefix), TempDirectory: temporaryDirectory,
		Recipient: recipient, Identity: identity, SigningKey: signingKey,
	}
	if err := options.Validate(); err != nil {
		return err
	}
	if preflight {
		return json.NewEncoder(os.Stdout).Encode(map[string]string{
			"mode": "configuration", "product": options.Product, "status": "ok",
		})
	}
	database, err := pgxpool.New(ctx, sourceDatabaseURL)
	if err != nil {
		return fmt.Errorf("open backup manifest database: %w", err)
	}
	defer database.Close()
	if err := database.Ping(ctx); err != nil {
		return fmt.Errorf("ping backup source database: %w", err)
	}
	runner := catalogbackup.Runner{
		Database: catalogbackup.PostgresOperator{Archive: catalogbackup.ProcessArchiveTool{}},
		Store:    store, Manifests: catalogbackup.PostgresManifestRepository{DB: database},
	}
	result, err := runner.Run(ctx, options)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode backup result: %w", err)
	}
	return nil
}

func boolEnvironment(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", key, err)
	}
	return parsed, nil
}

func environmentOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
