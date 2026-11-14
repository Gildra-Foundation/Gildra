package catalogtaxonomy

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Numeric semantics are the client DB2 enums, documented in TrinityCore's
// src/server/game/DataStores/DBCEnums.h (CriteriaType/CriteriaTreeFlags).
// In particular, Asset is NOT universally an entity ID (e.g. type 49 is a slot).
func achievementCriterionTarget(kind int64) string {
	switch kind {
	case 0, 20, 96, 208:
		return "creature"
	case 8:
		return "achievement"
	case 27:
		return "quest"
	case 28, 29, 34, 69, 110, 222:
		return "spell"
	case 36, 41, 42, 57, 185, 188:
		return "item"
	case 12, 229:
		return "currency"
	case 46, 206, 243:
		return "faction"
	case 11, 31, 163, 164, 225, 226:
		return "area"
	case 1, 15, 16, 32, 33, 71:
		return "map"
	case 7, 40, 75, 112:
		return "profession"
	case 52:
		return "class"
	default:
		return ""
	}
}

type achievementFields map[string]any

func (f achievementFields) text(key string) string {
	if value, ok := f[key]; ok && value != nil {
		return fmt.Sprint(value)
	}
	return ""
}
func (f achievementFields) number(key string) int64 {
	n, _ := strconv.ParseInt(f.text(key), 10, 64)
	return n
}

type achievementRaw struct {
	ID       int64
	Locale   string
	Fields   achievementFields
	Artifact string
}
type achievementSource struct {
	rows     map[string]map[int64]map[string]achievementRaw
	children map[int64][]int64
}

func newAchievementSource() *achievementSource {
	return &achievementSource{rows: make(map[string]map[int64]map[string]achievementRaw), children: make(map[int64][]int64)}
}
func (s *achievementSource) add(table string, row achievementRaw) {
	if s.rows[table] == nil {
		s.rows[table] = make(map[int64]map[string]achievementRaw)
	}
	if s.rows[table][row.ID] == nil {
		s.rows[table][row.ID] = make(map[string]achievementRaw)
	}
	s.rows[table][row.ID][row.Locale] = row
}
func (s *achievementSource) get(table string, id int64, locale string) (achievementRaw, bool) {
	r, ok := s.rows[table][id][locale]
	return r, ok
}
func (s *achievementSource) index() {
	s.children = make(map[int64][]int64)
	for id, locales := range s.rows["CriteriaTree"] {
		if r, ok := locales["en_US"]; ok {
			s.children[r.Fields.number("Parent")] = append(s.children[r.Fields.number("Parent")], id)
		}
	}
	for parent := range s.children {
		sort.Slice(s.children[parent], func(i, j int) bool {
			a, _ := s.get("CriteriaTree", s.children[parent][i], "en_US")
			b, _ := s.get("CriteriaTree", s.children[parent][j], "en_US")
			if a.Fields.number("OrderIndex") != b.Fields.number("OrderIndex") {
				return a.Fields.number("OrderIndex") < b.Fields.number("OrderIndex")
			}
			return a.ID < b.ID
		})
	}
}

type achievementTargetKey struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}
type achievementReference struct {
	ID                string `json:"id"`
	Type              string `json:"type"`
	ExternalID        int64  `json:"external_id"`
	Slug              string `json:"slug"`
	Name              string `json:"name"`
	Description       string `json:"-"`
	NameLocale        string `json:"name_locale,omitempty"`
	DescriptionLocale string `json:"-"`
}
type achievementCriterion struct {
	ID           int64                   `json:"id"`
	CriteriaID   int64                   `json:"criteria_id,omitempty"`
	CriteriaType *int64                  `json:"criteria_type,omitempty"`
	Asset        int64                   `json:"asset,omitempty"`
	Text         string                  `json:"text"`
	TextLocale   string                  `json:"text_locale,omitempty"`
	Amount       int64                   `json:"amount"`
	Operator     int64                   `json:"operator"`
	Flags        int64                   `json:"flags"`
	Order        int64                   `json:"order"`
	Faction      string                  `json:"faction,omitempty"`
	Target       *achievementReference   `json:"target,omitempty"`
	Children     []*achievementCriterion `json:"children,omitempty"`
}

func achievementSide(n int64) string {
	switch n {
	case 0:
		return "horde"
	case 1:
		return "alliance"
	case -1:
		return "both"
	}
	return ""
}

// tree retains logical groups, order, amounts and operators. DoNotDisplay hides
// the complete subtree; a blank structural node is not mistaken for a criterion.
// Source text may fall back to English, but is never labelled as Russian.
func (s *achievementSource) tree(id int64, locale string, refs map[achievementTargetKey]map[string]achievementReference, artifacts map[string]bool, path map[int64]bool) (*achievementCriterion, error) {
	r, ok := s.get("CriteriaTree", id, "en_US")
	if !ok || r.Fields.number("Flags")&2 != 0 {
		return nil, nil
	}
	if path[id] || len(path) >= 256 {
		return nil, fmt.Errorf("invalid achievement criteria tree at %d", id)
	}
	path[id] = true
	defer delete(path, id)
	if r.Artifact != "" {
		artifacts[r.Artifact] = true
	}
	node := &achievementCriterion{ID: id, CriteriaID: r.Fields.number("CriteriaID"), Amount: r.Fields.number("Amount"), Operator: r.Fields.number("Operator"), Flags: r.Fields.number("Flags"), Order: r.Fields.number("OrderIndex"), Text: r.Fields.text("Description_lang"), TextLocale: "en_US"}
	if localized, exists := s.get("CriteriaTree", id, locale); exists && strings.TrimSpace(localized.Fields.text("Description_lang")) != "" {
		node.Text = localized.Fields.text("Description_lang")
		node.TextLocale = locale
		if localized.Artifact != "" {
			artifacts[localized.Artifact] = true
		}
	}
	if node.Flags&512 != 0 {
		node.Faction = "alliance"
	}
	if node.Flags&1024 != 0 {
		node.Faction = "horde"
	}
	if criterion, exists := s.get("Criteria", node.CriteriaID, "en_US"); exists {
		kind := criterion.Fields.number("Type")
		node.CriteriaType = &kind
		node.Asset = criterion.Fields.number("Asset")
		if criterion.Artifact != "" {
			artifacts[criterion.Artifact] = true
		}
		key := achievementTargetKey{achievementCriterionTarget(kind), node.Asset}
		if target, exists := refs[key][locale]; exists {
			node.Target = &target
			if node.Text == "" {
				node.Text = target.Name
				node.TextLocale = target.NameLocale
			}
			if node.Flags&32 != 0 && target.Description != "" {
				node.Text = target.Description
				node.TextLocale = target.DescriptionLocale
			}
		}
	}
	for _, child := range s.children[id] {
		n, err := s.tree(child, locale, refs, artifacts, path)
		if err != nil {
			return nil, err
		}
		if n != nil {
			node.Children = append(node.Children, n)
		}
	}
	return node, nil
}
func (s *achievementSource) criteriaRoot(id int64, seen map[int64]bool) (int64, error) {
	if seen[id] {
		return 0, fmt.Errorf("achievement shares-criteria cycle at %d", id)
	}
	seen[id] = true
	row, ok := s.get("Achievement", id, "en_US")
	if !ok {
		return 0, nil
	}
	if root := row.Fields.number("Criteria_tree"); root > 0 {
		return root, nil
	}
	if shared := row.Fields.number("Shares_criteria"); shared > 0 {
		return s.criteriaRoot(shared, seen)
	}
	return 0, nil
}
func (s *achievementSource) categoryChain(id int64) ([]int64, error) {
	var chain []int64
	seen := map[int64]bool{}
	for id > 0 {
		if seen[id] {
			return nil, fmt.Errorf("achievement category cycle at %d", id)
		}
		seen[id] = true
		row, ok := s.get("Achievement_Category", id, "en_US")
		if !ok {
			break
		}
		chain = append(chain, id)
		id = row.Fields.number("Parent")
	}
	return chain, nil
}
func achievementCategoryPath(id int64) string { return fmt.Sprintf("categorys/category-%d", id) }
func achievementTreeText(n *achievementCriterion) string {
	if n == nil {
		return ""
	}
	out := n.Text
	for _, child := range n.Children {
		if text := achievementTreeText(child); text != "" {
			out += "\n" + text
		}
	}
	return strings.TrimSpace(out)
}
