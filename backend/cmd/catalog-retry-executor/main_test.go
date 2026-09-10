package main

import (
	"strings"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogpipeline"
	"github.com/google/uuid"
)

func TestRetryOptionsResumeOnlyFailedSourceAndDerivedReadModels(t *testing.T) {
	candidate := retryCandidate{
		ReleaseID: uuid.MustParse("51dbfc88-1bdc-4d39-85db-53f0ea3755c1"),
		Product:   "wow", BuildVersion: "12.1.0.69587", Source: "casc_db2", Environment: "production",
	}
	options, err := retryOptions(candidate, "/opt/gildra/bin")
	if err != nil {
		t.Fatal(err)
	}
	if options.Profile != catalogpipeline.ProfileRetailFoundation || options.Trigger != "retry" || options.ResumeReleaseID != candidate.ReleaseID.String() {
		t.Fatalf("unexpected retry options: %#v", options)
	}
	want := []string{"import-db2", "rebuild-projections", "rebuild-entity-graph", "refresh-coverage"}
	if strings.Join(options.ResumeStages, ",") != strings.Join(want, ",") {
		t.Fatalf("resume stages = %#v, want %#v", options.ResumeStages, want)
	}
}

func TestRetryOptionsRejectsUnknownSource(t *testing.T) {
	_, err := retryOptions(retryCandidate{ReleaseID: uuid.New(), Product: "wow", BuildVersion: "12.1.0.69587", Source: "unknown", Environment: "production"}, "/bin")
	if err == nil || !strings.Contains(err.Error(), "unsupported retry source") {
		t.Fatalf("retryOptions() error = %v", err)
	}
}
