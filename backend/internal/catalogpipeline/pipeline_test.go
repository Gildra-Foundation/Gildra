package catalogpipeline

import (
	"strings"
	"testing"
)

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
		if stage.Key == "import-listfile" && !strings.Contains(strings.Join(stage.Arguments, " "), "-version 12.1.0.69404") {
			t.Fatalf("listfile import is not pinned to the release build: %#v", stage.Arguments)
		}
		if stage.Key == "import-wago" && !strings.Contains(strings.Join(stage.Arguments, " "), "-build 69404") {
			t.Fatalf("Wago import is not pinned to the release build number: %#v", stage.Arguments)
		}
		if (stage.Key == "import-db2" || stage.Key == "import-listfile") && !strings.Contains(strings.Join(stage.Arguments, " "), "-product wow") {
			t.Fatalf("%s is not product-scoped: %#v", stage.Key, stage.Arguments)
		}
	}
}

func TestBuildNumberRejectsUnpinnedVersions(t *testing.T) {
	if got := buildNumber("12.1.0.69404"); got != 69404 {
		t.Fatalf("buildNumber() = %d, want 69404", got)
	}
	for _, version := range []string{"", "12.1.0", "12.1.0.bad", "12.1.0.0"} {
		if got := buildNumber(version); got != 0 {
			t.Fatalf("buildNumber(%q) = %d, want 0", version, got)
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

func TestBuildPlanRejectsUnknownCatalogAccessMode(t *testing.T) {
	if _, err := BuildPlan(Options{Product: "wow", Sources: []string{"wago"}, CatalogAccessMode: "partner"}); err == nil || !strings.Contains(err.Error(), "access mode") {
		t.Fatalf("expected unknown catalog access mode to be rejected, got %v", err)
	}
}

func TestRetailFoundationProfileExcludesCommunityEnrichment(t *testing.T) {
	plan, err := BuildPlan(Options{Product: "wow", Profile: ProfileRetailFoundation})
	if err != nil {
		t.Fatal(err)
	}
	wantImports := []string{"import-wago", "import-db2", "import-battlenet", "import-battlenet-media", "import-listfile"}
	for index, key := range wantImports {
		if plan[index].Key != key {
			t.Fatalf("foundation stage %d = %q, want %q", index, plan[index].Key, key)
		}
	}
	for _, stage := range plan {
		if stage.Key == "import-raidbots" {
			t.Fatal("retail foundation must not include Raidbots community enrichment")
		}
	}
	if _, err := BuildPlan(Options{Product: "wow", Profile: ProfileRetailFoundation, Sources: []string{"raidbots"}}); err == nil {
		t.Fatal("expected foundation profile to reject a source outside the profile")
	}
}

func TestNormalizeOptionsSelectsProductAwareProfiles(t *testing.T) {
	tests := []struct {
		name            string
		product         string
		profile         string
		sources         []string
		buildVersion    string
		wantProfile     string
		wantSources     []string
		wantErrContains string
	}{
		{
			name: "retail default", product: "wow",
			wantProfile: ProfileRetailFoundation, wantSources: []string{"wago", "db2", "battlenet", "listfile"},
		},
		{
			name: "classic default", product: "wow_classic", buildVersion: "4.4.2.69900",
			wantProfile: ProfileClassicFoundation, wantSources: []string{"db2", "listfile"},
		},
		{
			name: "classic era default", product: "wow_classic_era", buildVersion: "1.15.8.69901",
			wantProfile: ProfileClassicEraFoundation, wantSources: []string{"db2", "listfile"},
		},
		{
			name: "classic hardcore default", product: "wow_classic_hardcore", buildVersion: "1.15.8.69902",
			wantProfile: ProfileClassicHardcoreFoundation, wantSources: []string{"db2", "listfile"},
		},
		{
			name: "classic requires pinned version", product: "wow_classic",
			wantErrContains: "require an explicit -version",
		},
		{
			name: "retail profile rejects classic product", product: "wow_classic", profile: ProfileRetailFoundation,
			wantErrContains: "only supports product \"wow\"",
		},
		{
			name: "classic profile rejects retail product", product: "wow", profile: ProfileClassicFoundation,
			wantErrContains: "only supports product \"wow_classic\"",
		},
		{
			name: "classic profile rejects retail-only source", product: "wow_classic", profile: ProfileClassicFoundation,
			sources: []string{"battlenet"}, buildVersion: "4.4.2.69900", wantErrContains: "outside the classic-foundation profile",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := normalizeOptions(Options{
				Product: test.product, Profile: test.profile, Sources: test.sources, BuildVersion: test.buildVersion,
			})
			if test.wantErrContains != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErrContains) {
					t.Fatalf("normalizeOptions() error = %v, want %q", err, test.wantErrContains)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Profile != test.wantProfile {
				t.Fatalf("profile = %q, want %q", got.Profile, test.wantProfile)
			}
			if strings.Join(got.Sources, ",") != strings.Join(test.wantSources, ",") {
				t.Fatalf("sources = %#v, want %#v", got.Sources, test.wantSources)
			}
		})
	}
}

func TestClassicProfilesPinDB2AndListfileToTheirProductBuild(t *testing.T) {
	tests := []struct {
		product string
		profile string
		version string
	}{
		{product: "wow_classic", profile: ProfileClassicFoundation, version: "4.4.2.69900"},
		{product: "wow_classic_era", profile: ProfileClassicEraFoundation, version: "1.15.8.69901"},
		{product: "wow_classic_hardcore", profile: ProfileClassicHardcoreFoundation, version: "1.15.8.69902"},
	}
	for _, test := range tests {
		t.Run(test.product, func(t *testing.T) {
			plan, err := BuildPlan(Options{Product: test.product, Profile: test.profile, BuildVersion: test.version})
			if err != nil {
				t.Fatal(err)
			}
			imports := make(map[string]Stage)
			for _, stage := range plan {
				if stage.Key != "import-db2" && stage.Key != "import-listfile" {
					continue
				}
				imports[stage.Key] = stage
				arguments := strings.Join(stage.Arguments, " ")
				if !strings.Contains(arguments, "-product "+test.product) || !strings.Contains(arguments, "-version "+test.version) {
					t.Fatalf("%s arguments = %#v, want product and pinned version", stage.Key, stage.Arguments)
				}
			}
			if len(imports) != 2 {
				t.Fatalf("classic import stages = %#v, want DB2 and listfile", imports)
			}
		})
	}
}

func TestProductionRetailGateRejectsClassicProfiles(t *testing.T) {
	_, err := BuildPlan(Options{
		Mode:                   "apply",
		PublicationEnvironment: "production",
		Product:                "wow_classic",
		Profile:                ProfileClassicFoundation,
		BuildVersion:           "4.4.2.69900",
		MaxRecords:             0,
		ConfirmFullImport:      true,
	})
	if err == nil || !strings.Contains(err.Error(), "must use the retail-foundation profile") {
		t.Fatalf("expected production retail gate rejection, got %v", err)
	}
}

func TestProductionImportSafetyRequiresPinnedBuildAndExplicitFullConfirmation(t *testing.T) {
	base := Options{
		Mode: "apply", PublicationEnvironment: "production", Product: "wow",
		Profile: ProfileRetailFoundation, MaxRecords: 100,
	}
	if _, err := BuildPlan(base); err == nil || !strings.Contains(err.Error(), "explicit -version") {
		t.Fatalf("expected missing build rejection, got %v", err)
	}
	base.BuildVersion = "12.1.0.69404"
	base.Sources = []string{"wago"}
	if _, err := BuildPlan(base); err == nil || !strings.Contains(err.Error(), "requires source") {
		t.Fatalf("expected incomplete source profile rejection, got %v", err)
	}
	base.Sources = nil
	if _, err := BuildPlan(base); err == nil || !strings.Contains(err.Error(), "requires an unbounded import") {
		t.Fatalf("expected bounded production import rejection, got %v", err)
	}
	base.MaxRecords = 0
	if _, err := BuildPlan(base); err == nil || !strings.Contains(err.Error(), "-confirm-full-import") {
		t.Fatalf("expected unbounded import rejection, got %v", err)
	}
	base.ConfirmFullImport = true
	plan, err := BuildPlan(base)
	if err != nil {
		t.Fatal(err)
	}
	if plan[0].Key != "recovery-gate" {
		t.Fatalf("first production stage = %q, want recovery-gate", plan[0].Key)
	}
}

func TestProductionSameHostRecoveryRequiresExplicitKnownPolicy(t *testing.T) {
	base := Options{
		Mode: "apply", PublicationEnvironment: "production", Product: "wow",
		Profile: ProfileRetailFoundation, BuildVersion: "12.1.0.69404",
		MaxRecords: 0, ConfirmFullImport: true,
	}
	if _, err := BuildPlan(base); err != nil {
		t.Fatalf("default off-host recovery policy should remain valid: %v", err)
	}
	base.RecoveryPolicy = "local"
	if _, err := BuildPlan(base); err == nil || !strings.Contains(err.Error(), "unsupported recovery policy") {
		t.Fatalf("expected unknown recovery policy rejection, got %v", err)
	}
	base.RecoveryPolicy = "verified_same_host"
	if _, err := BuildPlan(base); err != nil {
		t.Fatalf("explicit verified same-host policy should be accepted: %v", err)
	}
}

func TestApplyPlanWrapsImportersInAtomicReleaseStages(t *testing.T) {
	plan, err := BuildPlan(Options{
		Mode: "apply", PublicationEnvironment: "development", Product: "wow",
		Profile: "custom", Sources: []string{"wago"}, BuildVersion: "12.1.0.69404", MaxRecords: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan) < 3 || plan[0].Key != "release-start" || plan[len(plan)-1].Key != "release-publish" {
		t.Fatalf("apply plan is not release-wrapped: %#v", plan)
	}
}
