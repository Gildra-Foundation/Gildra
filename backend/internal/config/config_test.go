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
}

func TestLoadRejectsInvalidIndexNowKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://gildra:test@localhost:5432/gildra")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "not-hex")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid IndexNow key to be rejected")
	}
}
