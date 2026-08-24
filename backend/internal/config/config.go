package config

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"time"
)

var indexNowKeyPattern = regexp.MustCompile(`^[A-Za-z0-9-]{8,128}$`)

type Config struct {
	HTTPAddr               string
	DatabaseURL            string
	ClickHouseAddr         string
	ClickHouseDatabase     string
	ClickHouseUser         string
	ClickHousePassword     string
	RedisAddr              string
	RedisPassword          string
	IndexNowKey            string
	IndexNowHost           string
	SentryDSN              string
	SentryEnvironment      string
	ShutdownTimeout        time.Duration
	AnalyticsCacheTTL      time.Duration
	DatasetWorkerURL       string
	DatasetWorkerTimeout   time.Duration
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
	AdminSessionTTL        time.Duration
	CatalogPublicationMode string
	CatalogPublicationEnv  string
}

func Load() (Config, error) {
	shutdownTimeout, err := durationEnv("SHUTDOWN_TIMEOUT", 15*time.Second)
	if err != nil {
		return Config{}, err
	}
	cacheTTL, err := durationEnv("ANALYTICS_CACHE_TTL", 30*time.Second)
	if err != nil {
		return Config{}, err
	}
	datasetWorkerTimeout, err := durationEnv("DATASET_WORKER_TIMEOUT", 25*time.Minute)
	if err != nil {
		return Config{}, err
	}
	adminSessionTTL, err := durationEnv("ADMIN_SESSION_TTL", 12*time.Hour)
	if err != nil {
		return Config{}, err
	}

	sentryEnvironment := envOr("SENTRY_ENVIRONMENT", "development")
	publicationEnvironment := envOr("CATALOG_PUBLICATION_ENVIRONMENT", normalizedPublicationEnvironment(sentryEnvironment))
	publicationMode := os.Getenv("CATALOG_PUBLICATION_MODE")
	if publicationMode == "" {
		publicationMode = "report"
		if publicationEnvironment == "production" {
			publicationMode = "enforce"
		}
	}
	cfg := Config{
		HTTPAddr:               envOr("HTTP_ADDR", ":8080"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		ClickHouseAddr:         envOr("CLICKHOUSE_ADDR", "clickhouse:9000"),
		ClickHouseDatabase:     envOr("CLICKHOUSE_DATABASE", "gildra"),
		ClickHouseUser:         envOr("CLICKHOUSE_USER", "gildra"),
		ClickHousePassword:     os.Getenv("CLICKHOUSE_PASSWORD"),
		RedisAddr:              envOr("REDIS_ADDR", "redis:6379"),
		RedisPassword:          os.Getenv("REDIS_PASSWORD"),
		IndexNowKey:            os.Getenv("INDEXNOW_KEY"),
		IndexNowHost:           envOr("INDEXNOW_HOST", "gildra.net"),
		SentryDSN:              os.Getenv("SENTRY_DSN"),
		SentryEnvironment:      sentryEnvironment,
		ShutdownTimeout:        shutdownTimeout,
		AnalyticsCacheTTL:      cacheTTL,
		DatasetWorkerURL:       envOr("DATASET_WORKER_URL", "http://scraper-worker:8081"),
		DatasetWorkerTimeout:   datasetWorkerTimeout,
		AdminBootstrapEmail:    os.Getenv("ADMIN_BOOTSTRAP_EMAIL"),
		AdminBootstrapPassword: os.Getenv("ADMIN_BOOTSTRAP_PASSWORD"),
		AdminSessionTTL:        adminSessionTTL,
		CatalogPublicationMode: publicationMode,
		CatalogPublicationEnv:  publicationEnvironment,
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.ClickHousePassword == "" {
		return Config{}, errors.New("CLICKHOUSE_PASSWORD is required")
	}
	if !indexNowKeyPattern.MatchString(cfg.IndexNowKey) {
		return Config{}, errors.New("INDEXNOW_KEY must be 8-128 letters, numbers, or dashes")
	}
	if cfg.CatalogPublicationMode != "off" && cfg.CatalogPublicationMode != "report" && cfg.CatalogPublicationMode != "enforce" {
		return Config{}, errors.New("CATALOG_PUBLICATION_MODE must be off, report, or enforce")
	}
	if cfg.CatalogPublicationEnv != "development" && cfg.CatalogPublicationEnv != "staging" && cfg.CatalogPublicationEnv != "production" {
		return Config{}, errors.New("CATALOG_PUBLICATION_ENVIRONMENT must be development, staging, or production")
	}

	return cfg, nil
}

func normalizedPublicationEnvironment(value string) string {
	switch value {
	case "production":
		return "production"
	case "staging":
		return "staging"
	default:
		return "development"
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s=%s: %w", key, strconv.Quote(value), err)
	}
	return parsed, nil
}
