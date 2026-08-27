package main

import (
	"testing"
)

func TestParseOptionsRequiresExplicitSnapshot(t *testing.T) {
	t.Parallel()
	_, err := parseOptions(nil, func(name string) string {
		if name == "DATABASE_URL" {
			return "postgres://example.test/gildra"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected missing snapshot ID to fail")
	}
}

func TestParseOptionsDefaultsToReadOnlyPreview(t *testing.T) {
	t.Parallel()
	opts, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
	}, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if opts.confirm {
		t.Fatal("resolution must be read-only unless -confirm is explicit")
	}
}

func TestParseOptionsAcceptsExplicitConfirmation(t *testing.T) {
	t.Parallel()
	opts, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-confirm",
	}, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if !opts.confirm {
		t.Fatal("expected explicit confirmation")
	}
}

func TestParseOptionsRequiresConfirmationForNPCProjection(t *testing.T) {
	t.Parallel()
	_, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-project-npc-facts",
	}, func(string) string { return "" })
	if err == nil {
		t.Fatal("NPC fact projection must require explicit confirmation")
	}
}
