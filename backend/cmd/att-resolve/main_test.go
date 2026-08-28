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

func TestParseOptionsRequiresConfirmationForLootProjection(t *testing.T) {
	t.Parallel()
	_, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-project-loot-facts",
	}, func(string) string { return "" })
	if err == nil {
		t.Fatal("loot fact projection must require explicit confirmation")
	}
}

func TestParseOptionsAcceptsConfirmedLootProjection(t *testing.T) {
	t.Parallel()
	opts, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-confirm", "-project-loot-facts",
	}, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if !opts.confirm || !opts.projectLoot {
		t.Fatal("expected confirmed loot projection")
	}
}

func TestParseOptionsRequiresConfirmationForCreatureIdentityProjection(t *testing.T) {
	t.Parallel()
	_, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-project-creature-identities",
	}, func(string) string { return "" })
	if err == nil {
		t.Fatal("creature identity projection must require explicit confirmation")
	}
}

func TestParseOptionsRequiresConfirmationForReferenceIdentityProjection(t *testing.T) {
	t.Parallel()
	_, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-project-reference-identities",
	}, func(string) string { return "" })
	if err == nil {
		t.Fatal("reference identity projection must require explicit confirmation")
	}
}

func TestParseOptionsAcceptsConfirmedReferenceIdentityProjection(t *testing.T) {
	t.Parallel()
	opts, err := parseOptions([]string{
		"-database-url", "postgres://example.test/gildra",
		"-snapshot-id", "a2dfadbb-c166-4634-a329-34db945477a2",
		"-confirm", "-project-reference-identities",
	}, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if !opts.confirm || !opts.projectReferenceIdentities {
		t.Fatal("expected confirmed reference identity projection")
	}
}
