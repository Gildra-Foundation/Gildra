package config

import (
	"testing"
	"time"
)

func TestLoadValidatesRequiredSettings(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.IndexNowHost != "gildra.net" {
		t.Fatalf("unexpected IndexNow host: %s", cfg.IndexNowHost)
	}
	if cfg.CatalogRecoveryPolicy != "off_host" {
		t.Fatalf("unexpected default recovery policy: %s", cfg.CatalogRecoveryPolicy)
	}
	if cfg.CatalogAccessMode != "public" {
		t.Fatalf("unexpected default catalog access mode: %s", cfg.CatalogAccessMode)
	}
}

func TestLoadAcceptsPrivateCatalogAccess(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	t.Setenv("CATALOG_ACCESS_MODE", "private")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CatalogAccessMode != "private" {
		t.Fatalf("unexpected catalog access mode: %s", cfg.CatalogAccessMode)
	}
}

func TestLoadRejectsUnknownCatalogAccessMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	t.Setenv("CATALOG_ACCESS_MODE", "partner")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid catalog access mode to be rejected")
	}
}

func TestLoadAcceptsExplicitVerifiedSameHostRecovery(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	t.Setenv("CATALOG_RECOVERY_POLICY", "verified_same_host")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CatalogRecoveryPolicy != "verified_same_host" {
		t.Fatalf("unexpected recovery policy: %s", cfg.CatalogRecoveryPolicy)
	}
}

func TestLoadRejectsUnknownRecoveryPolicy(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	t.Setenv("CATALOG_RECOVERY_POLICY", "local")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid recovery policy to be rejected")
	}
}

func TestLoadRejectsInvalidIndexNowKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "not-hex")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid IndexNow key to be rejected")
	}
}

func TestLoadEnforcesPublicationPolicyInProduction(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	t.Setenv("SENTRY_ENVIRONMENT", "production")
	t.Setenv("CATALOG_PUBLICATION_MODE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CatalogPublicationMode != "enforce" || cfg.CatalogPublicationEnv != "production" {
		t.Fatalf("unexpected production publication config: mode=%s env=%s", cfg.CatalogPublicationMode, cfg.CatalogPublicationEnv)
	}
}

func TestLoadDatabaseLimits(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RequestTimeout != 20*time.Second || cfg.DatabaseMaxConns != 0 || cfg.WorkerDatabaseMaxConns != 5 {
		t.Fatalf("defaults = %v, %d, %d", cfg.RequestTimeout, cfg.DatabaseMaxConns, cfg.WorkerDatabaseMaxConns)
	}
	t.Setenv("API_REQUEST_TIMEOUT", "5s")
	t.Setenv("DATABASE_MAX_CONNS", "24")
	if cfg, err = Load(); err != nil || cfg.RequestTimeout != 5*time.Second || cfg.DatabaseMaxConns != 24 {
		t.Fatalf("overrides = %v, %d, %v", cfg.RequestTimeout, cfg.DatabaseMaxConns, err)
	}
	t.Setenv("DATABASE_MAX_CONNS", "-1")
	if _, err := Load(); err == nil {
		t.Fatal("negative DATABASE_MAX_CONNS was accepted")
	}
}
