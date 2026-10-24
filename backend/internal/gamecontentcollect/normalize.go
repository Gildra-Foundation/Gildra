package gamecontentcollect

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type upstreamEncounter struct {
	ID   int    `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type upstreamRaid struct {
	ID         int                 `json:"id"`
	Slug       string              `json:"slug"`
	Name       string              `json:"name"`
	Encounters []upstreamEncounter `json:"encounters"`
	Starts     map[string]string   `json:"starts"`
	Ends       map[string]string   `json:"ends"`
}
type upstreamDungeon struct {
	ID          int    `json:"id"`
	ChallengeID int    `json:"challenge_mode_id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Timer       int    `json:"keystone_timer_seconds"`
}

// Facts deliberately contain no editorial text, translations, tactical status
// or gameplay verification date. These are source observations, not a public
// projection. The editorial composition/approval layer remains separate.
func Normalize(t Target, raw []byte) (map[string]any, []string, error) {
	if err := t.Validate(); err != nil {
		return nil, nil, err
	}
	facts := map[string]any{"schemaVersion": 1, "edition": "retail", "moduleId": t.ModuleID, "provider": "raiderio", "namespace": "expansion-11", "adapterVersion": AdapterVersion}
	warnings := []string{"ruRU_not_collected", "content_build_unknown", "gameplay_not_verified"}
	if t.ModuleID == "raids" {
		var data struct {
			Raids []upstreamRaid `json:"raids"`
		}
		if json.Unmarshal(raw, &data) != nil || len(data.Raids) == 0 || len(data.Raids) > 100 {
			return nil, nil, &Failure{Code: "invalid_raid_schema"}
		}
		raids := map[string]any{}
		seenEncounters := map[int]bool{}
		for _, raid := range data.Raids {
			key := strconv.Itoa(raid.ID)
			if raid.ID <= 0 || raids[key] != nil || raid.Slug == "" || raid.Name == "" || len(raid.Encounters) == 0 || len(raid.Encounters) > 64 {
				return nil, nil, &Failure{Code: "invalid_raid_identity"}
			}
			encounters := map[string]any{}
			for order, boss := range raid.Encounters {
				id := strconv.Itoa(boss.ID)
				if boss.ID <= 0 || encounters[id] != nil || boss.Slug == "" || boss.Name == "" {
					return nil, nil, &Failure{Code: "invalid_encounter_identity"}
				}
				mapping, known := encounterMapping[boss.ID]
				if known {
					validGroup := false
					for _, slug := range raidGroups[raid.ID] {
						if slug == mapping[0] {
							validGroup = true
						}
					}
					if !validGroup || seenEncounters[boss.ID] {
						return nil, nil, &Failure{Code: "conflicting_encounter_mapping"}
					}
					seenEncounters[boss.ID] = true
				} else {
					warnings = append(warnings, fmt.Sprintf("unmapped_encounter:%d:%d", raid.ID, boss.ID))
				}
				encounters[id] = map[string]any{"sourceSlug": boss.Slug, "nameEn": boss.Name, "order": order + 1, "canonicalRaidSlug": mapping[0], "canonicalBossSlug": mapping[1]}
			}
			slugs, known := raidGroups[raid.ID]
			if !known {
				warnings = append(warnings, fmt.Sprintf("unmapped_raid:%d", raid.ID))
				slugs = []string{}
			}
			raids[key] = map[string]any{"sourceSlug": raid.Slug, "sourceNameEn": raid.Name, "canonicalRaidSlugs": slugs, "encounters": encounters, "starts": raid.Starts, "ends": raid.Ends}
		}
		for id := range raidGroups {
			if raids[strconv.Itoa(id)] == nil {
				return nil, nil, &Failure{Code: "incomplete_raid_groups"}
			}
		}
		if len(seenEncounters) != len(encounterMapping) {
			return nil, nil, &Failure{Code: "incomplete_known_encounters"}
		}
		facts["raids"] = raids
	} else {
		var data struct {
			Seasons []struct {
				Slug     string            `json:"slug"`
				Name     string            `json:"name"`
				ID       int               `json:"blizzard_season_id"`
				Dungeons []upstreamDungeon `json:"dungeons"`
				Starts   map[string]string `json:"starts"`
				Ends     map[string]string `json:"ends"`
			} `json:"seasons"`
		}
		if json.Unmarshal(raw, &data) != nil || len(data.Seasons) == 0 || len(data.Seasons) > 100 {
			return nil, nil, &Failure{Code: "invalid_mythic_schema"}
		}
		found := false
		available := map[string]any{}
		for _, season := range data.Seasons {
			if season.Slug == "" || season.Name == "" || available[season.Slug] != nil {
				return nil, nil, &Failure{Code: "invalid_season_catalog"}
			}
			identity := map[string]any{"nameEn": season.Name, "starts": season.Starts, "ends": season.Ends}
			if season.ID > 0 {
				identity["blizzardSeasonId"] = season.ID
			}
			available[season.Slug] = identity
			if season.Slug != "season-mn-2" && season.Slug != "season-mn-1" && season.Slug != "season-mn-1-break-the-meta" {
				warnings = append(warnings, "unconfigured_season:"+season.Slug)
			}
			if season.Slug != "season-mn-2" {
				continue
			}
			if found || season.ID != 18 || season.Name == "" || len(season.Dungeons) == 0 || len(season.Dungeons) > 64 {
				return nil, nil, &Failure{Code: "invalid_season_identity"}
			}
			found = true
			dungeons := map[string]any{}
			challengeIDs := map[int]bool{}
			for _, dungeon := range season.Dungeons {
				id := strconv.Itoa(dungeon.ID)
				if dungeon.ID <= 0 || dungeon.ChallengeID <= 0 || challengeIDs[dungeon.ChallengeID] || dungeons[id] != nil || dungeon.Slug == "" || dungeon.Name == "" || dungeon.Timer < 60 || dungeon.Timer > 6*60*60 {
					return nil, nil, &Failure{Code: "invalid_dungeon_identity_or_timer"}
				}
				challengeIDs[dungeon.ChallengeID] = true
				canonical, known := dungeonMapping[dungeon.ID]
				if !known {
					warnings = append(warnings, fmt.Sprintf("unmapped_dungeon:%d", dungeon.ID))
				}
				dungeons[id] = map[string]any{"sourceSlug": dungeon.Slug, "nameEn": dungeon.Name, "canonicalSlug": canonical, "challengeModeId": dungeon.ChallengeID, "timerSeconds": dungeon.Timer}
			}
			for id := range dungeonMapping {
				if dungeons[strconv.Itoa(id)] == nil {
					return nil, nil, &Failure{Code: "incomplete_season_dungeons"}
				}
			}
			facts["season"] = map[string]any{"sourceSlug": season.Slug, "canonicalSlug": "midnight-season-2", "blizzardSeasonId": season.ID, "nameEn": season.Name, "starts": season.Starts, "ends": season.Ends}
			facts["dungeons"] = dungeons
		}
		if !found {
			return nil, nil, &Failure{Code: "configured_season_missing"}
		}
		facts["availableSeasons"] = available
	}
	sort.Strings(warnings)
	return facts, warnings, nil
}

type Change struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Before any    `json:"before"`
	After  any    `json:"after"`
}
type Diff struct {
	Total     int      `json:"total"`
	Truncated bool     `json:"truncated"`
	Changes   []Change `json:"changes"`
}

func Difference(before, after map[string]any) Diff {
	result := Diff{Changes: []Change{}}
	var visit func(string, any, any, bool, bool)
	visit = func(path string, a, b any, hadA, hadB bool) {
		am, aok := a.(map[string]any)
		bm, bok := b.(map[string]any)
		if (aok || !hadA) && (bok || !hadB) && (aok || bok) {
			keys := map[string]bool{}
			for k := range am {
				keys[k] = true
			}
			for k := range bm {
				keys[k] = true
			}
			ordered := []string{}
			for k := range keys {
				ordered = append(ordered, k)
			}
			sort.Strings(ordered)
			for _, k := range ordered {
				av, ah := am[k]
				bv, bh := bm[k]
				escaped := strings.ReplaceAll(strings.ReplaceAll(k, "~", "~0"), "/", "~1")
				visit(path+"/"+escaped, av, bv, ah, bh)
			}
			return
		}
		if hadA && hadB && string(canonical(a)) == string(canonical(b)) {
			return
		}
		kind := "changed"
		if !hadA {
			kind = "added"
		} else if !hadB {
			kind = "removed"
		}
		result.Total++
		if len(result.Changes) < 2000 {
			result.Changes = append(result.Changes, Change{path, kind, a, b})
		} else {
			result.Truncated = true
		}
	}
	visit("", before, after, before != nil, true)
	return result
}
