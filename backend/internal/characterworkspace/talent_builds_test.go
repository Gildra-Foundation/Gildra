package characterworkspace

import (
	"encoding/json"
	"testing"
)

func TestTalentLibraryMigrationAndLimit(t *testing.T) {
	builds := []map[string]any{}
	for i := 0; i < 14; i++ {
		builds = append(builds, map[string]any{"id": string(rune('a' + i))})
	}
	legacy, _ := json.Marshal(builds)
	migrated, _ := json.Marshal(talentLibrary{SchemaVersion: 3, Builds: builds, Deleted: map[string]string{}})
	if err := validateTalentUpdate(legacy, migrated); err != nil {
		t.Fatal(err)
	}
	if err := validateTalentUpdate(nil, migrated); err == nil {
		t.Fatal("new over-limit library accepted")
	}
	if err := validateTalentUpdate(migrated, legacy); err == nil {
		t.Fatal("old client overwrote versioned library")
	}
}
func TestTalentDeletionCannotBeLostOrResurrected(t *testing.T) {
	previous := json.RawMessage(`{"schemaVersion":3,"builds":[],"deleted":{"one":"2026-10-19T09:00:00Z"}}`)
	for _, next := range []string{
		`{"schemaVersion":3,"builds":[],"deleted":{}}`,
		`{"schemaVersion":3,"builds":[{"id":"one"}],"deleted":{"one":"2026-10-19T09:00:00Z"}}`,
	} {
		if err := validateTalentUpdate(previous, json.RawMessage(next)); err == nil {
			t.Fatal("deletion lost")
		}
	}
	if err := validateTalentUpdate(previous, previous); err != nil {
		t.Fatal(err)
	}
}
