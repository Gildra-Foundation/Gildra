package config

import "testing"

func TestGameContentCollectionIsOffOrCollectOnly(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://local/example")
	t.Setenv("CLICKHOUSE_PASSWORD", "test")
	t.Setenv("INDEXNOW_KEY", "00000000000000000000000000000000")
	for _, mode := range []string{"", "off", "collect_only", "auto", "publish"} {
		t.Setenv("GAME_CONTENT_COLLECTION_MODE", mode)
		cfg, err := Load()
		if mode == "auto" || mode == "publish" {
			if err == nil {
				t.Fatal("accepted publication mode")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		want := mode
		if want == "" {
			want = "off"
		}
		if cfg.GameContentCollectMode != want {
			t.Fatal(cfg.GameContentCollectMode)
		}
	}
}
