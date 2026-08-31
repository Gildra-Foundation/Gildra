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
