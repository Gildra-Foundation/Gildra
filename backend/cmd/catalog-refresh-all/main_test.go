package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
)

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
		t.Fatal("Retail uses Wago for build discovery")
	}
	classic, err := selectProducts([]string{"classic"})
	if err != nil {
		t.Fatal(err)
	}
	if containsBattleNetProduct(classic) {
		t.Fatal("Classic must not require the unsupported Battle.net namespace")
	}
	if !containsBattleNetProduct([]productSpec{{Source: "battlenet"}}) {
		t.Fatal("an explicitly Battle.net-backed edition should initialize the client")
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

func TestCurrentWagoBuildUsesEditionManifest(t *testing.T) {
	t.Parallel()
	var requestedPath string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestedPath = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string][]map[string]string{
			"wow":             {{"version": "12.1.0.69497"}},
			"wow_classic":     {{"version": "5.5.4.69383"}},
			"wow_classic_era": {{"version": "1.15.9.69547"}},
		})
	}))
	defer server.Close()

	client := wago.New(wago.Config{BaseURL: server.URL, HTTPClient: server.Client(), RetryMax: 1})
	classic, err := currentWagoBuild(context.Background(), client, productSpecs[1])
	if err != nil {
		t.Fatalf("currentWagoBuild(classic) returned error: %v", err)
	}
	if classic != "5.5.4.69383" {
		t.Fatalf("classic build = %q, want product manifest build", classic)
	}
	if requestedPath != "/api/builds" {
		t.Fatalf("Wago request path = %q, want /api/builds", requestedPath)
	}
	hardcore, err := currentWagoBuild(context.Background(), client, productSpecs[3])
	if err != nil {
		t.Fatalf("currentWagoBuild(hardcore) returned error: %v", err)
	}
	if hardcore != "1.15.9.69547" {
		t.Fatalf("hardcore build = %q, want Era manifest build", hardcore)
	}
}

func TestBuildCheckMetadataPreservesManifestProduct(t *testing.T) {
	t.Parallel()
	retail := buildCheckMetadata(productSpecs[0])
	if got := retail["wago_product"]; got != "wow" {
		t.Fatalf("Retail wago_product = %#v, want wow", got)
	}
	if _, shared := retail["shared_manifest"]; shared {
		t.Fatal("Retail must not be marked as a shared manifest")
	}
	hardcore := buildCheckMetadata(productSpecs[3])
	if got := hardcore["wago_product"]; got != "wow_classic_era" {
		t.Fatalf("Hardcore wago_product = %#v, want wow_classic_era", got)
	}
	if got := hardcore["shared_manifest"]; got != true {
		t.Fatalf("Hardcore shared_manifest = %#v, want true", got)
	}
}
