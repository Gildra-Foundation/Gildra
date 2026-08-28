package config

import "testing"

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
