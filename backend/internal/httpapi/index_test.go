package httpapi

import (
	"context"
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
}

func TestAPIIndexAdvertisesTheRequestedEditionBase(t *testing.T) {
	t.Parallel()
	tests := []struct {
		product string
		edition string
	}{
		{product: "wow", edition: "retail"},
		{product: "wow_classic", edition: "classic"},
		{product: "wow_classic_era", edition: "classic-era"},
		{product: "wow_classic_hardcore", edition: "hardcore"},
	}
	for _, tt := range tests {
		t.Run(tt.product, func(t *testing.T) {
			product := api.GetAPIIndexParamsProduct(tt.product)
			response, err := (&Server{}).GetAPIIndex(context.Background(), api.GetAPIIndexRequestObject{
				Params: api.GetAPIIndexParams{Product: &product},
			})
			if err != nil {
				t.Fatal(err)
			}
			index, ok := response.(api.GetAPIIndex200JSONResponse)
			if !ok {
				t.Fatalf("GetAPIIndex response type = %T", response)
			}
			want := "https://api.gildra.net/world-of-warcraft/" + tt.edition + "/v1"
			if index.Rest != want+"/" || index.Catalog != want+"/game/entities" || index.Library != want+"/library/datasets" {
				t.Fatalf("API index for %s = %#v, want base %s", tt.product, index, want)
			}
		})
	}
}
