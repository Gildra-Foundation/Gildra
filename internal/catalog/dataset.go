package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/Shpuntyara/DataTest/internal/raidbots"
)

type TreeRecord struct {
	ExternalID  int64
	TraitTreeID int64
	Name        string
	Icon        string
	Payload     json.RawMessage
}

type Appearance struct {
	SpecID      int64  `json:"spec_id"`
	TraitTreeID int64  `json:"trait_tree_id"`
	NodeID      int64  `json:"node_id"`
	TreeKind    string `json:"tree_kind"`
}

type TalentRecord struct {
	ExternalID   int64
	DefinitionID int64
	SpellID      int64
	Name         string
	Icon         string
	Type         string
	MaxRanks     int
	Appearances  []Appearance
}

type Dataset struct {
	Trees   []TreeRecord
	Talents []TalentRecord
}

func Build(trees []raidbots.TalentTree) (Dataset, error) {
	if len(trees) == 0 {
		return Dataset{}, errors.New("talent dataset is empty")
	}
	result := Dataset{Trees: make([]TreeRecord, 0, len(trees))}
	specIDs := make(map[int64]struct{}, len(trees))
	talents := make(map[int64]*TalentRecord)

	for _, tree := range trees {
		if tree.SpecID <= 0 || tree.TraitTreeID <= 0 || strings.TrimSpace(tree.ClassName) == "" || strings.TrimSpace(tree.SpecName) == "" {
			return Dataset{}, fmt.Errorf("invalid tree class=%q spec=%q specId=%d traitTreeId=%d", tree.ClassName, tree.SpecName, tree.SpecID, tree.TraitTreeID)
		}
		if _, duplicate := specIDs[tree.SpecID]; duplicate {
			return Dataset{}, fmt.Errorf("duplicate specialization id %d", tree.SpecID)
		}
		specIDs[tree.SpecID] = struct{}{}
		icon := firstIcon(tree)
		payload, err := treePayload(tree, icon)
		if err != nil {
			return Dataset{}, fmt.Errorf("encode specialization %d: %w", tree.SpecID, err)
		}
		result.Trees = append(result.Trees, TreeRecord{
			ExternalID: tree.SpecID, TraitTreeID: tree.TraitTreeID,
			Name: strings.TrimSpace(tree.ClassName) + " — " + strings.TrimSpace(tree.SpecName),
			Icon: icon, Payload: payload,
		})

		groups := []struct {
			kind  string
			nodes []raidbots.Node
		}{{"class", tree.ClassNodes}, {"spec", tree.SpecNodes}, {"hero", tree.HeroNodes}, {"subtree", tree.SubTreeNodes}}
		for _, group := range groups {
			for _, node := range group.nodes {
				for _, entry := range node.Entries {
					if entry.ID == 0 && strings.TrimSpace(entry.Name) == "" {
						continue // Raidbots occasionally includes an empty placeholder entry.
					}
					if entry.ID <= 0 || strings.TrimSpace(entry.Name) == "" {
						return Dataset{}, fmt.Errorf("invalid entry in specialization %d node %d", tree.SpecID, node.ID)
					}
					appearance := Appearance{SpecID: tree.SpecID, TraitTreeID: tree.TraitTreeID, NodeID: node.ID, TreeKind: group.kind}
					existing, ok := talents[entry.ID]
					if !ok {
						talents[entry.ID] = &TalentRecord{
							ExternalID: entry.ID, DefinitionID: entry.DefinitionID, SpellID: entry.SpellID,
							Name: strings.TrimSpace(entry.Name), Icon: entry.Icon, Type: entry.Type,
							MaxRanks: entry.MaxRanks, Appearances: []Appearance{appearance},
						}
						continue
					}
					if existing.Name != strings.TrimSpace(entry.Name) || existing.DefinitionID != entry.DefinitionID || existing.SpellID != entry.SpellID {
						return Dataset{}, fmt.Errorf("conflicting talent entry id %d", entry.ID)
					}
					if !slices.Contains(existing.Appearances, appearance) {
						existing.Appearances = append(existing.Appearances, appearance)
					}
				}
			}
		}
	}

	result.Talents = make([]TalentRecord, 0, len(talents))
	for _, talent := range talents {
		slices.SortFunc(talent.Appearances, compareAppearance)
		result.Talents = append(result.Talents, *talent)
	}
	slices.SortFunc(result.Trees, func(a, b TreeRecord) int { return int(a.ExternalID - b.ExternalID) })
	slices.SortFunc(result.Talents, func(a, b TalentRecord) int { return int(a.ExternalID - b.ExternalID) })
	return result, nil
}

func treePayload(tree raidbots.TalentTree, icon string) (json.RawMessage, error) {
	var raw map[string]any
	if err := json.Unmarshal(tree.Raw, &raw); err != nil {
		return nil, err
	}
	if icon != "" {
		raw["icon"] = icon
	}
	return json.Marshal(map[string]any{
		"name":     strings.TrimSpace(tree.ClassName) + " — " + strings.TrimSpace(tree.SpecName),
		"raidbots": raw,
	})
}

func firstIcon(tree raidbots.TalentTree) string {
	for _, nodes := range [][]raidbots.Node{tree.SpecNodes, tree.ClassNodes, tree.HeroNodes} {
		for _, node := range nodes {
			for _, entry := range node.Entries {
				if entry.Icon != "" {
					return entry.Icon
				}
			}
		}
	}
	return ""
}

func compareAppearance(a, b Appearance) int {
	if a.SpecID != b.SpecID {
		return int(a.SpecID - b.SpecID)
	}
	if a.TreeKind != b.TreeKind {
		return strings.Compare(a.TreeKind, b.TreeKind)
	}
	return int(a.NodeID - b.NodeID)
}
