// Package transmog serves item appearances and transmog sets for the
// transmog studio: which looks fit an equipment slot, what a set puts on a
// character and the ItemDisplayInfoID the 3D viewer needs for each look.
//
// The data comes from the DB2 tables of the published catalog build
// (ItemModifiedAppearance → ItemAppearance → ItemDisplayInfoID, Item,
// ItemSparse, TransmogSet, TransmogSetItem). It is small enough (≈160k item
// looks, ≈5k sets) to keep in memory, so searches never touch the database.
package transmog

import (
	"sort"
	"strings"
	"unicode"
)

// Slot is an equipment slot of the studio's paper doll.
type Slot string

const (
	SlotHead     Slot = "head"
	SlotShoulder Slot = "shoulder"
	SlotBack     Slot = "back"
	SlotChest    Slot = "chest"
	SlotShirt    Slot = "shirt"
	SlotTabard   Slot = "tabard"
	SlotWrist    Slot = "wrist"
	SlotHands    Slot = "hands"
	SlotWaist    Slot = "waist"
	SlotLegs     Slot = "legs"
	SlotFeet     Slot = "feet"
	SlotMainHand Slot = "main-hand"
	SlotOffHand  Slot = "off-hand"
)

// Slots lists the paper-doll slots in display order.
var Slots = []Slot{SlotHead, SlotShoulder, SlotBack, SlotChest, SlotShirt, SlotTabard, SlotWrist,
	SlotHands, SlotWaist, SlotLegs, SlotFeet, SlotMainHand, SlotOffHand}

// inventorySlots maps Item.InventoryType to the slots that can show it. A
// one-handed weapon fits either hand; a robe is a chest piece.
var inventorySlots = map[int][]Slot{
	1: {SlotHead}, 3: {SlotShoulder}, 4: {SlotShirt}, 5: {SlotChest}, 6: {SlotWaist}, 7: {SlotLegs},
	8: {SlotFeet}, 9: {SlotWrist}, 10: {SlotHands}, 13: {SlotMainHand, SlotOffHand}, 14: {SlotOffHand},
	15: {SlotMainHand}, 16: {SlotBack}, 17: {SlotMainHand}, 19: {SlotTabard}, 20: {SlotChest},
	21: {SlotMainHand}, 22: {SlotOffHand}, 23: {SlotOffHand}, 26: {SlotMainHand},
}

// ViewerSlot is the slot number the Wowhead model viewer expects for an
// inventory type: weapons go to 21 (main hand) or 22 (off hand), the rest
// keep their inventory type (a robe stays 20).
func ViewerSlot(inventoryType int, slot Slot) int {
	switch slot {
	case SlotMainHand:
		return 21
	case SlotOffHand:
		return 22
	}
	return inventoryType
}

// Armor types of armor items (Item.SubclassID of class 4).
var armorSubclasses = map[string]int{"cloth": 1, "leather": 2, "mail": 3, "plate": 4, "cosmetic": 5}

// look is one ItemModifiedAppearance: an item in one of its appearance variants.
type look struct {
	ModifiedAppearanceID int64
	ItemID               int64
	AppearanceID         int64
	DisplayID            int64
	InventoryType        int
	ClassID              int
	SubclassID           int
	Quality              int
	IconName             string
	Names                map[string]string // locale → name
}

// set is one TransmogSet with the looks it puts on.
type set struct {
	ID          int64
	ClassMask   int64
	ExpansionID int
	Names       map[string]string
	Looks       []int64 // ItemModifiedAppearanceIDs, primary looks first
}

// Index holds every look and set of one catalog build.
type Index struct {
	BuildID     int64
	looks       map[int64]*look   // by ItemModifiedAppearanceID
	appearances map[int64][]*look // by ItemAppearanceID, best representative first
	bySlot      map[Slot][]int64  // appearance IDs, newest first
	sets        map[int64]*set
	setOrder    []int64            // sets with at least one wearable look, newest first
	searchKeys  map[int64][]string // appearance ID → normalized names of all its items
	setKeys     map[int64][]string // set ID → normalized names
}

func newIndex(buildID int64, looks []*look, sets []*set) *Index {
	index := &Index{BuildID: buildID, looks: make(map[int64]*look, len(looks)), appearances: map[int64][]*look{},
		bySlot: map[Slot][]int64{}, sets: map[int64]*set{}, searchKeys: map[int64][]string{}, setKeys: map[int64][]string{}}
	for _, item := range looks {
		if item.DisplayID <= 0 || len(inventorySlots[item.InventoryType]) == 0 {
			continue
		}
		index.looks[item.ModifiedAppearanceID] = item
		index.appearances[item.AppearanceID] = append(index.appearances[item.AppearanceID], item)
	}
	for appearanceID, items := range index.appearances {
		sort.Slice(items, func(i, j int) bool {
			if items[i].Quality != items[j].Quality {
				return items[i].Quality > items[j].Quality
			}
			return items[i].ItemID > items[j].ItemID
		})
		slots := map[Slot]bool{}
		keys := map[string]bool{}
		for _, item := range items {
			for _, slot := range inventorySlots[item.InventoryType] {
				slots[slot] = true
			}
			for _, name := range item.Names {
				if key := normalize(name); key != "" {
					keys[key] = true
				}
			}
		}
		for slot := range slots {
			index.bySlot[slot] = append(index.bySlot[slot], appearanceID)
		}
		for key := range keys {
			index.searchKeys[appearanceID] = append(index.searchKeys[appearanceID], key)
		}
	}
	for slot, ids := range index.bySlot {
		sort.Slice(ids, func(i, j int) bool { return index.appearances[ids[i]][0].ItemID > index.appearances[ids[j]][0].ItemID })
		index.bySlot[slot] = ids
	}
	for _, entry := range sets {
		wearable := entry.Looks[:0]
		for _, id := range entry.Looks {
			if index.looks[id] != nil {
				wearable = append(wearable, id)
			}
		}
		entry.Looks = wearable
		index.sets[entry.ID] = entry
		if len(entry.Looks) == 0 {
			continue
		}
		index.setOrder = append(index.setOrder, entry.ID)
		for _, name := range entry.Names {
			if key := normalize(name); key != "" {
				index.setKeys[entry.ID] = append(index.setKeys[entry.ID], key)
			}
		}
	}
	sort.Slice(index.setOrder, func(i, j int) bool { return index.setOrder[i] > index.setOrder[j] })
	return index
}

// normalize folds case and ё so "Ёж" finds "еж".
func normalize(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "ё", "е")
	return strings.Join(strings.FieldsFunc(value, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '\'' }), " ")
}

// matchRank orders search hits: 0 name starts with the query, 1 a word
// starts with it, 2 contains it; -1 no match.
func matchRank(keys []string, query string) int {
	best := -1
	for _, key := range keys {
		rank := -1
		switch {
		case strings.HasPrefix(key, query):
			rank = 0
		case strings.Contains(key, " "+query):
			rank = 1
		case strings.Contains(key, query):
			rank = 2
		}
		if rank >= 0 && (best < 0 || rank < best) {
			best = rank
		}
	}
	return best
}

// AppearanceQuery filters the looks of one slot.
type AppearanceQuery struct {
	Slot   Slot
	Query  string
	Armor  string // cloth, leather, mail, plate, cosmetic or empty
	Locale string
	Offset int
	Limit  int
}

// Appearance is one look as the studio shows it: the representative item of
// an ItemAppearance and the IDs the viewer and share links need.
type Appearance struct {
	ModifiedAppearanceID int64  `json:"modifiedAppearanceId"`
	AppearanceID         int64  `json:"appearanceId"`
	DisplayID            int64  `json:"displayId"`
	ItemID               int64  `json:"itemId"`
	InventoryType        int    `json:"inventoryType"`
	Slot                 Slot   `json:"slot"`
	ViewerSlot           int    `json:"viewerSlot"`
	Name                 string `json:"name"`
	Quality              int    `json:"quality"`
	IconName             string `json:"iconName,omitempty"`
	Armor                string `json:"armor,omitempty"`
	ItemCount            int    `json:"itemCount"`
}

// AppearancePage is one page of a slot search.
type AppearancePage struct {
	Data       []Appearance `json:"data"`
	Total      int          `json:"total"`
	NextCursor string       `json:"nextCursor,omitempty"`
	BuildID    int64        `json:"buildId"`
}

func armorName(item *look) string {
	if item.ClassID != 4 {
		return ""
	}
	for name, subclass := range armorSubclasses {
		if subclass == item.SubclassID {
			return name
		}
	}
	return ""
}

func localizedName(names map[string]string, locale string) string {
	if name := names[locale]; name != "" {
		return name
	}
	return names["en_US"]
}

func (index *Index) appearance(item *look, slot Slot, locale string) Appearance {
	if slot == "" {
		slot = inventorySlots[item.InventoryType][0]
	}
	return Appearance{ModifiedAppearanceID: item.ModifiedAppearanceID, AppearanceID: item.AppearanceID, DisplayID: item.DisplayID,
		ItemID: item.ItemID, InventoryType: item.InventoryType, Slot: slot, ViewerSlot: ViewerSlot(item.InventoryType, slot),
		Name: localizedName(item.Names, locale), Quality: item.Quality, IconName: item.IconName, Armor: armorName(item),
		ItemCount: len(index.appearances[item.AppearanceID])}
}

// fitsSlot reports whether the look can be worn in the slot.
func fitsSlot(item *look, slot Slot) bool {
	for _, candidate := range inventorySlots[item.InventoryType] {
		if candidate == slot {
			return true
		}
	}
	return false
}

// Appearances searches the looks of a slot. Without a query the newest looks
// come first; with one, name-prefix hits come before word and substring hits.
func (index *Index) Appearances(query AppearanceQuery) AppearancePage {
	needle := normalize(query.Query)
	subclass, filterArmor := armorSubclasses[query.Armor]
	type hit struct {
		id   int64
		rank int
	}
	hits := make([]hit, 0, 256)
	for position, appearanceID := range index.bySlot[query.Slot] {
		items := index.appearances[appearanceID]
		if filterArmor && (items[0].ClassID != 4 || items[0].SubclassID != subclass) {
			continue
		}
		rank := 0
		if needle != "" {
			if rank = matchRank(index.searchKeys[appearanceID], needle); rank < 0 {
				continue
			}
		}
		hits = append(hits, hit{id: appearanceID, rank: rank*1_000_000 + position})
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].rank < hits[j].rank })
	page := AppearancePage{Data: []Appearance{}, Total: len(hits), BuildID: index.BuildID}
	end := min(len(hits), query.Offset+query.Limit)
	for _, entry := range hits[min(query.Offset, len(hits)):end] {
		items := index.appearances[entry.id]
		item := items[0]
		if needle != "" {
			// Show the item whose name matched, not just the representative.
			for _, candidate := range items {
				if fitsSlot(candidate, query.Slot) && matchRank([]string{normalize(localizedName(candidate.Names, query.Locale))}, needle) >= 0 {
					item = candidate
					break
				}
			}
		}
		page.Data = append(page.Data, index.appearance(item, query.Slot, query.Locale))
	}
	if end < len(hits) {
		page.NextCursor = encodeOffset(end)
	}
	return page
}

// Resolve returns the looks for ItemModifiedAppearanceIDs (share links), in
// the order asked, skipping unknown IDs.
func (index *Index) Resolve(ids []int64, locale string) []Appearance {
	result := make([]Appearance, 0, len(ids))
	for _, id := range ids {
		if item := index.looks[id]; item != nil {
			result = append(result, index.appearance(item, "", locale))
		}
	}
	return result
}

// SetSummary is one transmog set in a list.
type SetSummary struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ClassMask   int64  `json:"classMask"`
	ExpansionID int    `json:"expansionId"`
	ItemCount   int    `json:"itemCount"`
	IconName    string `json:"iconName,omitempty"`
}

// SetDetail is a set with the looks it puts on, one per slot.
type SetDetail struct {
	SetSummary
	Items []Appearance `json:"items"`
}

// SetPage is one page of a set search.
type SetPage struct {
	Data       []SetSummary `json:"data"`
	Total      int          `json:"total"`
	NextCursor string       `json:"nextCursor,omitempty"`
	BuildID    int64        `json:"buildId"`
}

// SetQuery filters transmog sets.
type SetQuery struct {
	Query   string
	ClassID int // 1-based class ID, 0 for every class
	Locale  string
	Offset  int
	Limit   int
}

func (index *Index) setItems(entry *set, locale string) []Appearance {
	seen := map[Slot]bool{}
	items := make([]Appearance, 0, len(entry.Looks))
	for _, id := range entry.Looks {
		item := index.looks[id]
		slot := inventorySlots[item.InventoryType][0]
		if seen[slot] {
			continue
		}
		seen[slot] = true
		items = append(items, index.appearance(item, slot, locale))
	}
	sort.Slice(items, func(i, j int) bool { return slotOrder(items[i].Slot) < slotOrder(items[j].Slot) })
	return items
}

func slotOrder(slot Slot) int {
	for position, candidate := range Slots {
		if candidate == slot {
			return position
		}
	}
	return len(Slots)
}

func (index *Index) setSummary(entry *set, locale string) SetSummary {
	items := index.setItems(entry, locale)
	summary := SetSummary{ID: entry.ID, Name: localizedName(entry.Names, locale), ClassMask: entry.ClassMask,
		ExpansionID: entry.ExpansionID, ItemCount: len(items)}
	for _, preferred := range []Slot{SlotChest, SlotHead, SlotShoulder} {
		for _, item := range items {
			if item.Slot == preferred && summary.IconName == "" {
				summary.IconName = item.IconName
			}
		}
	}
	if summary.IconName == "" && len(items) > 0 {
		summary.IconName = items[0].IconName
	}
	return summary
}

// Sets searches transmog sets that have at least one wearable look.
func (index *Index) Sets(query SetQuery) SetPage {
	needle := normalize(query.Query)
	type hit struct {
		id   int64
		rank int
	}
	hits := make([]hit, 0, 128)
	for position, id := range index.setOrder {
		entry := index.sets[id]
		if query.ClassID > 0 && entry.ClassMask != 0 && entry.ClassMask&(1<<(query.ClassID-1)) == 0 {
			continue
		}
		rank := 0
		if needle != "" {
			if rank = matchRank(index.setKeys[id], needle); rank < 0 {
				continue
			}
		}
		hits = append(hits, hit{id: id, rank: rank*1_000_000 + position})
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].rank < hits[j].rank })
	page := SetPage{Data: []SetSummary{}, Total: len(hits), BuildID: index.BuildID}
	end := min(len(hits), query.Offset+query.Limit)
	for _, entry := range hits[min(query.Offset, len(hits)):end] {
		page.Data = append(page.Data, index.setSummary(index.sets[entry.id], query.Locale))
	}
	if end < len(hits) {
		page.NextCursor = encodeOffset(end)
	}
	return page
}

// Set returns one set with its looks, or false when it is unknown or has
// nothing to wear.
func (index *Index) Set(id int64, locale string) (SetDetail, bool) {
	entry := index.sets[id]
	if entry == nil || len(entry.Looks) == 0 {
		return SetDetail{}, false
	}
	return SetDetail{SetSummary: index.setSummary(entry, locale), Items: index.setItems(entry, locale)}, true
}
