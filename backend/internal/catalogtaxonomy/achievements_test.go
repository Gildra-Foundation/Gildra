package catalogtaxonomy

import "testing"

func TestAchievementCriterionTargets(t *testing.T) {
	for kind, want := range map[int64]string{0: "creature", 8: "achievement", 27: "quest", 29: "spell", 36: "item", 12: "currency", 46: "faction", 163: "area", 1: "map", 49: "", 43: "", 5: "", 192: "", 250: "", 999: ""} {
		if got := achievementCriterionTarget(kind); got != want {
			t.Errorf("type %d: %q, want %q", kind, got, want)
		}
	}
}
func TestAchievementTreePreservesLogicAndLocalization(t *testing.T) {
	s := newAchievementSource()
	add := func(id, parent, order int64, locale, text string, flags int64) {
		s.add("CriteriaTree", achievementRaw{ID: id, Locale: locale, Artifact: "artifact-" + locale, Fields: achievementFields{"Parent": parent, "OrderIndex": order, "Description_lang": text, "Flags": flags, "Amount": 3, "Operator": 8, "CriteriaID": id}})
	}
	add(1, 0, 0, "en_US", "Root", 0)
	add(2, 1, 2, "en_US", "Later", 0)
	add(3, 1, 1, "en_US", "Earlier", 0)
	add(3, 1, 1, "ru_RU", "Раньше", 0)
	add(4, 3, 0, "en_US", "Nested", 0)
	add(5, 1, 0, "en_US", "Internal", 2)
	add(6, 5, 0, "en_US", "Hidden descendant", 0)
	s.add("Criteria", achievementRaw{ID: 4, Locale: "en_US", Fields: achievementFields{"Type": 27, "Asset": 100}})
	s.index()
	refs := map[achievementTargetKey]map[string]achievementReference{{"quest", 100}: {"ru_RU": {ID: "quest-uuid", Name: "Задание"}}}
	artifacts := map[string]bool{}
	tree, err := s.tree(1, "ru_RU", refs, artifacts, map[int64]bool{})
	if err != nil {
		t.Fatal(err)
	}
	if len(tree.Children) != 2 || tree.Children[0].ID != 3 || tree.Children[1].ID != 2 {
		t.Fatalf("order/hidden nodes: %+v", tree.Children)
	}
	first := tree.Children[0]
	if first.Text != "Раньше" || first.TextLocale != "ru_RU" || first.Amount != 3 || first.Operator != 8 {
		t.Fatalf("lost fields: %+v", first)
	}
	if len(first.Children) != 1 || first.Children[0].Target == nil || first.Children[0].Target.ID != "quest-uuid" {
		t.Fatalf("lost nested link: %+v", first)
	}
	if tree.TextLocale != "en_US" || !artifacts["artifact-ru_RU"] {
		t.Fatal("fallback or provenance misrepresented")
	}
}
func TestAchievementCyclesFail(t *testing.T) {
	s := newAchievementSource()
	for _, id := range []int64{1, 2} {
		s.add("CriteriaTree", achievementRaw{ID: id, Locale: "en_US", Fields: achievementFields{"Parent": 3 - id}})
	}
	s.index()
	if _, err := s.tree(1, "en_US", nil, map[string]bool{}, map[int64]bool{}); err == nil {
		t.Fatal("criteria cycle accepted")
	}
	for _, id := range []int64{1, 2} {
		s.add("Achievement", achievementRaw{ID: id, Locale: "en_US", Fields: achievementFields{"Shares_criteria": 3 - id}})
	}
	if _, err := s.criteriaRoot(1, map[int64]bool{}); err == nil {
		t.Fatal("shared criteria cycle accepted")
	}
	for _, id := range []int64{1, 2} {
		s.add("Achievement_Category", achievementRaw{ID: id, Locale: "en_US", Fields: achievementFields{"Parent": 3 - id}})
	}
	if _, err := s.categoryChain(1); err == nil {
		t.Fatal("category cycle accepted")
	}
}
func TestAchievementSharedCriteriaAndAbsentSource(t *testing.T) {
	s := newAchievementSource()
	s.add("Achievement", achievementRaw{ID: 1, Locale: "en_US", Fields: achievementFields{"Shares_criteria": 2}})
	s.add("Achievement", achievementRaw{ID: 2, Locale: "en_US", Fields: achievementFields{"Criteria_tree": 100}})
	root, err := s.criteriaRoot(1, map[int64]bool{})
	if err != nil || root != 100 {
		t.Fatalf("root %d: %v", root, err)
	}
	node, err := s.tree(root, "en_US", nil, map[string]bool{}, map[int64]bool{})
	if err != nil || node != nil {
		t.Fatal("missing source invented")
	}
}
