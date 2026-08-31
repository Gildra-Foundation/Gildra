package httpapi

import (
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

func TestToAPIProductPreservesEditionBuildAndPublication(t *testing.T) {
	buildNumber := int32(69497)
	buildVersion := "12.1.0.69497"
	result := toAPIProduct(catalog.Product{
		ID: 1, Slug: "wow", Name: "World of Warcraft",
		BuildNumber: &buildNumber, BuildVersion: &buildVersion, PublicRelease: true,
	})
	if result.Slug != "wow" || result.BuildNumber == nil || *result.BuildNumber != buildNumber ||
		result.BuildVersion == nil || *result.BuildVersion != buildVersion ||
		result.PublicRelease == nil || !*result.PublicRelease {
		t.Fatalf("product metadata was not preserved: %+v", result)
	}
}

func TestToAPIProductMarksUnpublishedEdition(t *testing.T) {
	result := toAPIProduct(catalog.Product{ID: 2, Slug: "wow_classic", Name: "Classic"})
	if result.PublicRelease == nil || *result.PublicRelease {
		t.Fatalf("unpublished product should expose publicRelease=false: %+v", result)
	}
}
