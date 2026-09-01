package httpapi

import (
	"context"
	"reflect"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/api"
)

func TestAPIIndexAdvertisesCanonicalRetailBase(t *testing.T) {
	response, err := (&Server{}).GetAPIIndex(context.Background(), api.GetAPIIndexRequestObject{})
	if err != nil {
		t.Fatalf("GetAPIIndex returned error: %v", err)
	}
	index, ok := response.(api.GetAPIIndex200JSONResponse)
	if !ok {
		t.Fatalf("GetAPIIndex response type = %T", response)
	}
	const base = "https://api.gildra.net/world-of-warcraft/retail/v1"
	if index.Rest != base+"/" || index.Catalog != base+"/game/entities" || index.Library != base+"/library/datasets" {
		t.Fatalf("API index does not advertise canonical retail base: %#v", index)
	}
	if index.Editions == nil || len(*index.Editions) != 4 {
		t.Fatalf("API index editions = %#v, want four products", index.Editions)
	}
	want := map[api.APIIndexEditionEdition]struct {
		product string
		base    string
	}{
		api.Retail:     {product: "wow", base: base},
		api.Classic:    {product: "wow_classic", base: base[:len(base)-len("retail/v1")] + "classic/v1"},
		api.ClassicEra: {product: "wow_classic_era", base: base[:len(base)-len("retail/v1")] + "classic-era/v1"},
		api.Hardcore:   {product: "wow_classic_hardcore", base: base[:len(base)-len("retail/v1")] + "hardcore/v1"},
	}
	seen := make(map[api.APIIndexEditionEdition]bool, len(*index.Editions))
	for position, edition := range *index.Editions {
		if edition.Base == "" || edition.Product == "" || !edition.Edition.Valid() {
			t.Fatalf("edition %d is incomplete: %#v", position, edition)
		}
		expected, ok := want[edition.Edition]
		if !ok || seen[edition.Edition] || edition.Product != expected.product || edition.Base != expected.base {
			t.Fatalf("edition %d has unexpected mapping: %#v", position, edition)
		}
		seen[edition.Edition] = true
	}
	if len(seen) != len(want) {
		t.Fatalf("API index edition mappings = %#v, want %#v", seen, want)
	}
}

func TestAPIIndexTrailingSlashMatchesCanonicalIndex(t *testing.T) {
	server := &Server{}
	response, err := server.GetAPIIndexTrailingSlash(context.Background(), api.GetAPIIndexTrailingSlashRequestObject{})
	if err != nil {
		t.Fatalf("GetAPIIndexTrailingSlash returned error: %v", err)
	}
	alias, ok := response.(api.GetAPIIndexTrailingSlash200JSONResponse)
	if !ok {
		t.Fatalf("GetAPIIndexTrailingSlash response type = %T", response)
	}
	canonicalResponse, err := server.GetAPIIndex(context.Background(), api.GetAPIIndexRequestObject{})
	if err != nil {
		t.Fatalf("GetAPIIndex returned error: %v", err)
	}
	canonical, ok := canonicalResponse.(api.GetAPIIndex200JSONResponse)
	if !ok {
		t.Fatalf("GetAPIIndex response type = %T", canonicalResponse)
	}
	if !reflect.DeepEqual(api.APIIndex(alias), api.APIIndex(canonical)) {
		t.Fatalf("trailing-slash index differs from canonical index: alias=%#v canonical=%#v", alias, canonical)
	}
}
