package catalog

import (
	"context"
	"maps"
	"slices"
)

// maxSpellReferenceDepth bounds how far nested spell references
// (`$@spelldesc123`, `$123s1`, ...) are followed when loading values.
const maxSpellReferenceDepth = 4

// spellValueKey groups the spell lookups that one query can answer.
type spellValueKey struct {
	product string
	locale  string
	buildID int64
}

// spellValueCache memoizes spell description values, including misses, for
// one request. Values are read-only once loaded, so entities on the same page
// can share them. Without it every entity of a list page issued up to eight
// queries of its own.
type spellValueCache struct {
	service *Service
	entries map[spellValueKey]map[int64]*spellDescriptionValues
}

func newSpellValueCache(service *Service) *spellValueCache {
	return &spellValueCache{service: service, entries: make(map[spellValueKey]map[int64]*spellDescriptionValues)}
}

// load returns the values of the requested spells that exist, querying only
// the IDs this cache has not seen yet.
func (c *spellValueCache) load(ctx context.Context, key spellValueKey, ids []int64) (map[int64]spellDescriptionValues, error) {
	known := c.entries[key]
	if known == nil {
		known = make(map[int64]*spellDescriptionValues)
		c.entries[key] = known
	}
	missing := make([]int64, 0, len(ids))
	for _, id := range ids {
		if _, ok := known[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		loaded, err := c.service.loadSpellDescriptionValues(ctx, key.product, key.locale, key.buildID, missing)
		if err != nil {
			return nil, err
		}
		for _, id := range missing {
			if value, ok := loaded[id]; ok {
				known[id] = &value
			} else {
				known[id] = nil
			}
		}
	}
	result := make(map[int64]spellDescriptionValues, len(ids))
	for _, id := range ids {
		if value := known[id]; value != nil {
			result[id] = *value
		}
	}
	return result, nil
}

// loadReferenced follows the spell references of texts breadth first, up to
// maxSpellReferenceDepth levels, and returns every value found on the way.
func (c *spellValueCache) loadReferenced(ctx context.Context, key spellValueKey, currentSpellID int64, texts []string) (map[int64]spellDescriptionValues, error) {
	values := make(map[int64]spellDescriptionValues)
	pending := referencedSpellIDs(texts, currentSpellID)
	for depth := 0; depth < maxSpellReferenceDepth && len(pending) > 0; depth++ {
		loaded, err := c.load(ctx, key, pending)
		if err != nil {
			return nil, err
		}
		maps.Copy(values, loaded)
		newTexts := make([]string, 0, len(loaded))
		for _, value := range loaded {
			newTexts = append(newTexts, value.Description)
		}
		candidates := referencedSpellIDs(newTexts, 0)
		pending = pending[:0]
		for _, id := range candidates {
			if _, seen := values[id]; !seen {
				pending = append(pending, id)
			}
		}
	}
	return values, nil
}

// prefetch loads, level by level, every spell that resolveEntityDescriptions
// can reach for these entities: one query per key and reference level instead
// of one per entity. The per-entity resolution afterwards is served from the
// cache and therefore sees exactly the values it would have loaded itself.
func (c *spellValueCache) prefetch(ctx context.Context, entities []*Entity) error {
	pending := make(map[spellValueKey]map[int64]struct{})
	add := func(key spellValueKey, ids []int64) {
		if len(ids) == 0 {
			return
		}
		set := pending[key]
		if set == nil {
			set = make(map[int64]struct{})
			pending[key] = set
		}
		for _, id := range ids {
			set[id] = struct{}{}
		}
	}
	for _, entity := range entities {
		if !entityNeedsDescriptionValues(entity) {
			continue
		}
		currentSpellID := descriptionSpellID(*entity)
		for _, locale := range []string{"en_US", "ru_RU"} {
			add(spellValueKey{entity.Product, locale, *entity.BuildID}, referencedSpellIDs(descriptionTexts(entity, locale), currentSpellID))
		}
		if entity.Tooltip == nil {
			continue
		}
		for _, block := range entity.Tooltip.Blocks {
			raw, _ := block["text"].(string)
			if blockSpellID := int64Value(block["spell_id"]); raw != "" && blockSpellID > 0 {
				add(spellValueKey{entity.Product, entity.Locale, *entity.BuildID}, referencedSpellIDs([]string{raw}, blockSpellID))
			}
		}
	}
	for depth := 0; depth < maxSpellReferenceDepth && len(pending) > 0; depth++ {
		next := make(map[spellValueKey]map[int64]struct{})
		for key, set := range pending {
			known := c.entries[key]
			ids := make([]int64, 0, len(set))
			for id := range set {
				if _, seen := known[id]; !seen {
					ids = append(ids, id)
				}
			}
			if len(ids) == 0 {
				continue
			}
			slices.Sort(ids)
			loaded, err := c.load(ctx, key, ids)
			if err != nil {
				return err
			}
			texts := make([]string, 0, len(loaded))
			for _, value := range loaded {
				texts = append(texts, value.Description)
			}
			for _, id := range referencedSpellIDs(texts, 0) {
				if _, seen := c.entries[key][id]; !seen {
					if next[key] == nil {
						next[key] = make(map[int64]struct{})
					}
					next[key][id] = struct{}{}
				}
			}
		}
		pending = next
	}
	return nil
}

// resolveDescriptions substitutes build-pinned values into the descriptions
// and tooltips of all entities, loading the values in batches.
func (s *Service) resolveDescriptions(ctx context.Context, entities []*Entity) error {
	cache := newSpellValueCache(s)
	if err := cache.prefetch(ctx, entities); err != nil {
		return err
	}
	for _, entity := range entities {
		if err := resolveEntityDescriptions(ctx, cache, entity); err != nil {
			return err
		}
	}
	return nil
}
