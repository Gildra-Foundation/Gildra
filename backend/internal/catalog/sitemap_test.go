package catalog

import "testing"

func TestSitemapShardBounds(t *testing.T) {
	t.Parallel()
	lower, upper, err := sitemapShardBounds("0f")
	if err != nil {
		t.Fatal(err)
	}
	if got := lower.String(); got != "0f000000-0000-0000-0000-000000000000" {
		t.Fatalf("lower = %s", got)
	}
	if upper == nil || upper.String() != "10000000-0000-0000-0000-000000000000" {
		t.Fatalf("upper = %v", upper)
	}
	_, upper, err = sitemapShardBounds("ff")
	if err != nil || upper != nil {
		t.Fatalf("last shard should have no upper bound: %v, %v", upper, err)
	}
	if _, _, err := sitemapShardBounds("xyz"); err == nil {
		t.Fatal("invalid shard should fail")
	}
}
