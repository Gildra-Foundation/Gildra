package catalog

import (
	"encoding/json"
	"testing"

	"github.com/Gildra-Foundation/Gildra/internal/raidbots"
)

func TestBuildKeepsSpecsSharingTraitTree(t *testing.T) {
	t.Parallel()
	trees := []raidbots.TalentTree{
		tree(t, 1, 71, "Warrior", "Arms", 1001, "Mortal Strike"),
		tree(t, 1, 72, "Warrior", "Fury", 1002, "Bloodthirst"),
	}
	dataset, err := Build(trees)
	if err != nil {
		t.Fatal(err)
	}
	if len(dataset.Trees) != 2 {
		t.Fatalf("tree count = %d, want 2", len(dataset.Trees))
	}
	if dataset.Trees[0].ExternalID != 71 || dataset.Trees[1].ExternalID != 72 {
		t.Fatalf("tree ids = %d,%d, want 71,72", dataset.Trees[0].ExternalID, dataset.Trees[1].ExternalID)
	}
}

func TestBuildMergesSharedTalentAppearances(t *testing.T) {
	t.Parallel()
	a := tree(t, 1, 71, "Warrior", "Arms", 1001, "Shared")
	b := tree(t, 1, 72, "Warrior", "Fury", 1001, "Shared")
	dataset, err := Build([]raidbots.TalentTree{a, b})
	if err != nil {
		t.Fatal(err)
	}
	if len(dataset.Talents) != 1 || len(dataset.Talents[0].Appearances) != 2 {
		t.Fatalf("talents/appearances = %d/%d, want 1/2", len(dataset.Talents), len(dataset.Talents[0].Appearances))
	}
}

func TestBuildRejectsDuplicateSpec(t *testing.T) {
	t.Parallel()
	a := tree(t, 1, 71, "Warrior", "Arms", 1001, "One")
	b := tree(t, 1, 71, "Warrior", "Arms", 1002, "Two")
	if _, err := Build([]raidbots.TalentTree{a, b}); err == nil {
		t.Fatal("Build() error = nil, want duplicate specialization error")
	}
}

func TestBuildSkipsRaidbotsPlaceholderEntry(t *testing.T) {
	t.Parallel()
	value := tree(t, 1, 71, "Warrior", "Arms", 1001, "Mortal Strike")
	value.SpecNodes = append(value.SpecNodes, raidbots.Node{ID: 99, Entries: []raidbots.Entry{{}}})
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	value.Raw = raw
	dataset, err := Build([]raidbots.TalentTree{value})
	if err != nil {
		t.Fatal(err)
	}
	if len(dataset.Talents) != 1 {
		t.Fatalf("talent count = %d, want 1", len(dataset.Talents))
	}
}

func tree(t *testing.T, traitTreeID, specID int64, className, specName string, entryID int64, entryName string) raidbots.TalentTree {
	t.Helper()
	value := raidbots.TalentTree{
		TraitTreeID: traitTreeID, SpecID: specID, ClassName: className, SpecName: specName,
		SpecNodes: []raidbots.Node{{ID: 10, Entries: []raidbots.Entry{{ID: entryID, DefinitionID: entryID + 1, SpellID: entryID + 2, Name: entryName, Icon: "icon"}}}},
	}
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	value.Raw = raw
	return value
}
