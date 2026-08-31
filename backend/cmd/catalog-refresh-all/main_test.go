package main

import "testing"

func TestSelectProductsDefaultsToAllEditions(t *testing.T) {
	t.Parallel()
	got, err := selectProducts(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 {
		t.Fatalf("edition count = %d, want 4", len(got))
	}
	if got[0].Product != "wow" || got[1].Product != "wow_classic" || got[2].Product != "wow_classic_era" || got[3].Product != "wow_classic_hardcore" {
		t.Fatalf("default product order = %#v", got)
	}
}

func TestSelectProductsAcceptsAliasesAndProductSlugs(t *testing.T) {
	t.Parallel()
	got, err := selectProducts([]string{"hardcore", "wow_classic_era", "retail", "wow", "hardcore"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Alias != "hardcore" || got[1].Alias != "classic-era" || got[2].Alias != "retail" {
		t.Fatalf("selected editions = %#v", got)
	}
}

func TestSelectProductsRejectsUnknownEdition(t *testing.T) {
	t.Parallel()
	if _, err := selectProducts([]string{"wow-vanilla"}); err == nil {
		t.Fatal("expected unknown edition error")
	}
}

func TestParseBuildNumberIsStrict(t *testing.T) {
	t.Parallel()
	if got, err := parseBuildNumber("12.1.0.69497"); err != nil || got != 69497 {
		t.Fatalf("parseBuildNumber() = %d, %v", got, err)
	}
	for _, version := range []string{"", "12.1.0", "12.1.0.0", "12.1.0.69497x", "live.12.1.0.69497", "foo.1.0.69497"} {
		if _, err := parseBuildNumber(version); err == nil {
			t.Fatalf("parseBuildNumber accepted %q", version)
		}
	}
}

func TestContainsBattleNetProduct(t *testing.T) {
	t.Parallel()
	retail, err := selectProducts([]string{"retail"})
	if err != nil {
		t.Fatal(err)
	}
	if containsBattleNetProduct(retail) {
		t.Fatal("Retail should not require Battle.net")
	}
	classic, err := selectProducts([]string{"classic"})
	if err != nil {
		t.Fatal(err)
	}
	if !containsBattleNetProduct(classic) {
		t.Fatal("Classic should require Battle.net")
	}
}

func TestProductSpecsPinEditionBuildSources(t *testing.T) {
	t.Parallel()
	want := map[string]struct {
		product string
		wagoKey string
	}{
		"retail":      {product: "wow", wagoKey: "wow"},
		"classic":     {product: "wow_classic", wagoKey: "wow_classic"},
		"classic-era": {product: "wow_classic_era", wagoKey: "wow_classic_era"},
		// Wago publishes the Era client under the same manifest key; the
		// Hardcore catalog remains a separate product and release pointer.
		"hardcore": {product: "wow_classic_hardcore", wagoKey: "wow_classic_era"},
	}
	for _, spec := range productSpecs {
		expected, ok := want[spec.Alias]
		if !ok {
			t.Fatalf("unexpected edition %q", spec.Alias)
		}
		if spec.Source != "wago_tools" || spec.Product != expected.product || spec.WagoKey != expected.wagoKey {
			t.Errorf("%s spec = %#v, want Wago source/product/key %#v", spec.Alias, spec, expected)
		}
	}
}
