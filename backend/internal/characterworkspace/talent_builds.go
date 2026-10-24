package characterworkspace

import (
	"encoding/json"
	"errors"
)

// Legacy arrays remain readable. Once migrated, old clients must not erase
// deletion markers or overwrite the versioned library with an array.
type talentLibrary struct {
	SchemaVersion int               `json:"schemaVersion"`
	Builds        []map[string]any  `json:"builds"`
	Deleted       map[string]string `json:"deleted"`
}

func decodeTalentLibrary(raw json.RawMessage) (talentLibrary, error) {
	var result talentLibrary
	if len(raw) == 0 {
		return result, nil
	}
	if err := json.Unmarshal(raw, &result.Builds); err == nil {
		return result, nil
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return result, err
	}
	if result.SchemaVersion != 3 {
		return result, errors.New("unsupported talent library version")
	}
	return result, nil
}

func validateTalentUpdate(previous, next json.RawMessage) error {
	old, err := decodeTalentLibrary(previous)
	if err != nil {
		return err
	}
	updated, err := decodeTalentLibrary(next)
	if err != nil {
		return err
	}
	if old.SchemaVersion == 3 && updated.SchemaVersion != 3 {
		return errors.New("reload to update this talent library")
	}
	for id := range old.Deleted {
		if updated.Deleted[id] == "" {
			return errors.New("talent deletion markers must be preserved")
		}
	}
	existing := map[string]bool{}
	for _, build := range old.Builds {
		if id, ok := build["id"].(string); ok {
			existing[id] = true
		}
	}
	seen := map[string]bool{}
	for _, build := range updated.Builds {
		id, ok := build["id"].(string)
		if !ok || id == "" || seen[id] {
			return errors.New("invalid or duplicate talent build id")
		}
		seen[id] = true
		if updated.Deleted[id] != "" {
			return errors.New("deleted talent builds cannot be restored")
		}
		if len(updated.Builds) > 12 && !existing[id] {
			return errors.New("talent build limit reached: remove a build before adding another")
		}
	}
	if updated.SchemaVersion == 3 {
		for id := range existing {
			if !seen[id] && updated.Deleted[id] == "" {
				return errors.New("removed talent builds require deletion markers")
			}
		}
	}
	return nil
}
