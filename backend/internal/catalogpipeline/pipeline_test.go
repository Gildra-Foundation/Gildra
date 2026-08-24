package catalogpipeline

import "testing"

func TestBuildPlanIsDeterministicAndNeverContainsDatabaseCredentials(t *testing.T) {
	plan, err := BuildPlan(Options{Product: "wow", Sources: []string{"wago", "raidbots", "db2", "battlenet", "listfile"}, BuildVersion: "12.1.0.69404", MaxRecords: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan) != 14 {
		t.Fatalf("expected 14 stages, got %d", len(plan))
	}
	expected := []string{
		"import-wago", "import-raidbots", "import-db2", "import-battlenet", "import-battlenet-media", "import-listfile",
		"rebuild-descriptions", "rebuild-item-variants", "rebuild-spell-effects",
		"rebuild-projections", "rebuild-entity-graph", "refresh-coverage",
		"validate-catalog", "publication-gate",
	}
	for index, key := range expected {
		if plan[index].Key != key {
			t.Fatalf("stage %d: expected %q, got %q", index, key, plan[index].Key)
		}
	}
	for _, stage := range plan {
		for _, argument := range stage.Arguments {
			if argument == "-database-url" {
				t.Fatal("database credentials must only be inherited through the environment")
			}
		}
	}
}

func TestSortedSourcesPlacesOfficialImportBeforeListfile(t *testing.T) {
	got := SortedSources("listfile,battlenet,wago")
	want := []string{"wago", "battlenet", "listfile"}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("SortedSources() = %#v, want %#v", got, want)
		}
	}
}

func TestBuildPlanRejectsUnknownSource(t *testing.T) {
	if _, err := BuildPlan(Options{Product: "wow", Sources: []string{"invented"}}); err == nil {
		t.Fatal("expected unknown source to be rejected")
	}
}
