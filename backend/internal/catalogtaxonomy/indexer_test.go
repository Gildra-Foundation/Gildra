package catalogtaxonomy

import (
	"strings"
	"testing"
)

func TestScopedTooltipSQLFiltersCandidateProduct(t *testing.T) {
	sql := scopedTooltipSQL()
	if !strings.Contains(sql, "JOIN game_entity_versions v ON v.id=e.latest_version_id") {
		t.Fatal("scoped tooltip SQL does not use the candidate version")
	}
	if !strings.Contains(sql, "WHERE e.product_id=$1 AND e.entity_type IN ('item','spell','talent','pvp_talent')") {
		t.Fatal("scoped tooltip SQL does not constrain the product")
	}
	if strings.Count(sql, "WHERE e.product_id=$1 AND e.entity_type IN ('item','spell','talent','pvp_talent')") != 1 {
		t.Fatal("scoped tooltip SQL changed more than the renderer scope")
	}
}

func TestItemDefinitionsHaveResolvedUniquePaths(t *testing.T) {
	t.Parallel()
	definitions := itemDefinitions()
	paths := make(map[string]struct{}, len(definitions))
	for _, definition := range definitions {
		if _, duplicate := paths[definition.Path]; duplicate {
			t.Fatalf("duplicate path %q", definition.Path)
		}
		paths[definition.Path] = struct{}{}
		if definition.ParentPath != "" {
			if _, exists := paths[definition.ParentPath]; !exists {
				t.Fatalf("parent %q must appear before %q", definition.ParentPath, definition.Path)
			}
		}
	}
}

func TestItemDefinitionsIncludePrimaryArmorSlots(t *testing.T) {
	t.Parallel()
	want := map[string]bool{"equipment/slots/head": false, "equipment/slots/chest": false, "equipment/slots/legs": false, "equipment/slots/hands": false}
	for _, definition := range itemDefinitions() {
		if _, exists := want[definition.Path]; exists && definition.Facet == "equipment_slot" {
			want[definition.Path] = true
		}
	}
	for path, found := range want {
		if !found {
			t.Errorf("missing primary armor slot %q", path)
		}
	}
}

func TestSlugify(t *testing.T) {
	t.Parallel()
	tests := []struct {
		input string
		want  string
	}{{"Death Knight", "death-knight"}, {"  Demon Hunter  ", "demon-hunter"}, {"Mage", "mage"}}
	for _, test := range tests {
		if got := slugify(test.input); got != test.want {
			t.Errorf("slugify(%q) = %q, want %q", test.input, got, test.want)
		}
	}
}
