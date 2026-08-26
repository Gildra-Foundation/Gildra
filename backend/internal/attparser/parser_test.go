package attparser

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseAuditedSnapshotWhenConfigured(t *testing.T) {
	path := os.Getenv("ATT_LUA_FIXTURE")
	if path == "" {
		t.Skip("ATT_LUA_FIXTURE is not configured")
	}
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	nodes, err := Parse(source, filepath.ToSlash(filepath.Base(path)))
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) == 0 {
		t.Fatal("audited ATT snapshot produced no nodes")
	}
	var referenced int
	for _, node := range nodes {
		referenced += len(node.References)
	}
	t.Logf("parsed %d nodes and %d references from %s", len(nodes), referenced, path)
}

func TestParseExtractsHierarchyAndExplicitReferencesWithoutExecution(t *testing.T) {
	t.Parallel()
	source := []byte(`local i,n,q=_.CreateItem,_.CreateNPC,_.CreateQuest
error("this code must never execute")
_.AddEventHandler("OnBuildDataCache",function(categories)
categories.Test=n(42,{coords={{1.5,2.5,84}},g={
q(7,{providers={{"n",42}},sourceQuests={6},g={
i(100,{cost={{"i",200,2},{"c",3,5}},spellID=9})
}})
}})
end)
`)
	nodes, err := Parse(source, "db/Standard/Test.lua")
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 3 {
		t.Fatalf("nodes = %d, want 3: %#v", len(nodes), nodes)
	}
	npc, quest, item := nodes[0], nodes[1], nodes[2]
	if npc.Kind != "creature" || npc.ExternalID == nil || *npc.ExternalID != 42 {
		t.Fatalf("NPC = %#v", npc)
	}
	if quest.ParentRecordKey != npc.RecordKey || len(quest.AncestorPath) != 1 {
		t.Fatalf("quest hierarchy = %#v", quest)
	}
	if item.ParentRecordKey != quest.RecordKey || len(item.AncestorPath) != 2 {
		t.Fatalf("item hierarchy = %#v", item)
	}
	assertReference(t, npc.References, "coordinate", "map", 84)
	assertReference(t, quest.References, "provider", "creature", 42)
	assertReference(t, quest.References, "quest_requirement", "quest", 6)
	assertReference(t, item.References, "cost", "item", 200)
	assertReference(t, item.References, "cost", "currency", 3)
	assertReference(t, item.References, "field", "spell", 9)
	if item.ContentHash == [32]byte{} || item.References[0].ContentHash == [32]byte{} {
		t.Fatal("expected deterministic content hashes")
	}
	repeated, err := Parse(source, "db/Standard/Test.lua")
	if err != nil {
		t.Fatal(err)
	}
	for index := range nodes {
		if nodes[index].RecordKey != repeated[index].RecordKey || nodes[index].ContentHash != repeated[index].ContentHash {
			t.Fatalf("node %d is not deterministic", index)
		}
	}
}

func TestParseRejectsInvalidLua(t *testing.T) {
	t.Parallel()
	_, err := Parse([]byte(`local i=_.CreateItem; i(`), "broken.lua")
	if err == nil || !strings.Contains(err.Error(), "broken.lua") {
		t.Fatalf("error = %v", err)
	}
}

func assertReference(t *testing.T, references []Reference, kind, targetType string, externalID int64) {
	t.Helper()
	for _, reference := range references {
		if reference.Kind == kind && reference.TargetType == targetType && reference.TargetExternalID == externalID {
			return
		}
	}
	t.Fatalf("missing %s %s %d in %#v", kind, targetType, externalID, references)
}
