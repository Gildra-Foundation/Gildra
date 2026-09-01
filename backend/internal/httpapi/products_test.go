package httpapi

import (
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
)

func TestToAPIProductPreservesEditionBuildAndPublication(t *testing.T) {
	buildNumber := int32(69497)
	buildVersion := "12.1.0.69497"
	sourceBuildNumber := int32(69497)
	sourceBuildVersion := "12.1.0.69497"
	source := "wago_tools"
	sourceStatus := "current"
	result := toAPIProduct(catalog.Product{
		ID: 1, Slug: "wow", Name: "World of Warcraft",
		BuildNumber: &buildNumber, BuildVersion: &buildVersion,
		Source: source, SourceBuildNumber: &sourceBuildNumber, SourceBuildVersion: &sourceBuildVersion,
		SourceStatus: &sourceStatus, Freshness: "fresh", FreshnessReason: "build matches",
		EntityCount: 825913, PublishedCount: 743967, PublicRelease: true,
	})
	if result.Slug != "wow" || result.BuildNumber == nil || *result.BuildNumber != buildNumber ||
		result.BuildVersion == nil || *result.BuildVersion != buildVersion ||
		result.EntityCount != 825913 || result.PublishedEntityCount != 743967 ||
		result.PublicRelease == nil || !*result.PublicRelease || result.Source == nil || *result.Source != source ||
		result.SourceBuildNumber == nil || *result.SourceBuildNumber != sourceBuildNumber || result.SourceBuildVersion == nil ||
		*result.SourceBuildVersion != sourceBuildVersion || result.SourceStatus == nil || string(*result.SourceStatus) != sourceStatus ||
		result.Freshness != "fresh" || result.FreshnessReason != "build matches" {
		t.Fatalf("product metadata was not preserved: %+v", result)
	}
}

func TestToAPIProductMarksUnpublishedEdition(t *testing.T) {
	result := toAPIProduct(catalog.Product{ID: 2, Slug: "wow_classic", Name: "Classic", EntityCount: 226766, PublishedCount: 225762})
	if result.PublicRelease == nil || *result.PublicRelease {
		t.Fatalf("unpublished product should expose publicRelease=false: %+v", result)
	}
	if result.EntityCount != 226766 || result.PublishedEntityCount != 225762 {
		t.Fatalf("edition counts were not preserved: %+v", result)
	}
}
