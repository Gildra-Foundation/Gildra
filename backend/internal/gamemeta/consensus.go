package gamemeta

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

func sprintfTier(column string) string { return fmt.Sprintf(tierOrderSQL, column) }

var tierLetters = []string{"S", "A", "B", "C", "D", "F"}

// tierValue puts every source's tier on one scale: S = 0, A = 1 … F = 5,
// a "+" a third of a step better and a "-" a third worse. ok is false for a
// label no source uses.
func tierValue(tier string) (float64, bool) {
	tier = strings.TrimSpace(strings.ToUpper(tier))
	if tier == "" {
		return 0, false
	}
	letter := -1
	for index, value := range tierLetters {
		if strings.HasPrefix(tier, value) {
			letter = index
		}
	}
	if letter < 0 {
		return 0, false
	}
	value := float64(letter)
	switch strings.TrimSpace(tier[1:]) {
	case "+":
		value -= 1.0 / 3
	case "-", "−":
		value += 1.0 / 3
	}
	return value, true
}

// consensusTier rounds a mean tier value back to a letter.
func consensusTier(value float64) string {
	index := int(math.Round(value))
	return tierLetters[max(0, min(index, len(tierLetters)-1))]
}

// Consensus merges the sources' own lists of one mode and role into
// Gildra's tier: a spec's tier is the median of the tiers the sources give it
// (one outlier cannot move it), its order inside the tier the mean tier, then
// the mean relative position (0 = first of its list), then how many sources
// rank it. Every source weighs the same; a spec
// one source leaves out simply has one tier fewer.
func Consensus(columns []SourceColumn, role string) []Entry {
	type tally struct {
		entry     Entry
		tierSum   float64
		tiers     []float64
		position  float64
		sources   int
		positions int
	}
	tallies := map[string]*tally{}
	order := []string{}
	for _, column := range columns {
		size := len(column.Entries)
		for index, entry := range column.Entries {
			value, ok := tierValue(entry.Tier)
			if !ok || entry.ClassSlug == "" || entry.SpecSlug == "" {
				continue
			}
			key := entry.ClassSlug + ":" + entry.SpecSlug
			item, seen := tallies[key]
			if !seen {
				item = &tally{entry: Entry{Role: role, ClassName: entry.ClassName, ClassSlug: entry.ClassSlug,
					SpecName: entry.SpecName, SpecSlug: entry.SpecSlug}}
				tallies[key] = item
				order = append(order, key)
			}
			item.tierSum += value
			item.tiers = append(item.tiers, value)
			item.sources++
			if size > 1 {
				item.position += float64(index) / float64(size-1)
				item.positions++
			}
			// The sources' numbers ride along for the spec card (wow.gg's first, then others).
			if column.Source == SourceWowGG || item.entry.Score == nil && item.entry.AverageDPS == nil && item.entry.Popularity == nil {
				item.entry.Score, item.entry.AverageDPS, item.entry.AverageHPS = entry.Score, entry.AverageDPS, entry.AverageHPS
				item.entry.Popularity, item.entry.MaxKey, item.entry.Rating, item.entry.Players = entry.Popularity, entry.MaxKey, entry.Rating, entry.Players
			}
			if item.entry.GuideURL == "" {
				item.entry.GuideURL = entry.GuideURL
			}
		}
	}
	entries := make([]Entry, 0, len(order))
	mean := map[string][3]float64{}
	for _, key := range order {
		item := tallies[key]
		tier := item.tierSum / float64(item.sources)
		position := 0.5
		if item.positions > 0 {
			position = item.position / float64(item.positions)
		}
		letter := tierMedian(item.tiers)
		mean[key] = [3]float64{math.Round(letter), tier, position}
		entry := item.entry
		entry.Tier = consensusTier(letter)
		entry.Sources = item.sources
		value := math.Round(tier*100) / 100
		entry.TierScore = &value
		entries = append(entries, entry)
	}
	sort.SliceStable(entries, func(a, b int) bool {
		left, right := mean[entries[a].ClassSlug+":"+entries[a].SpecSlug], mean[entries[b].ClassSlug+":"+entries[b].SpecSlug]
		for index := range left {
			if math.Abs(left[index]-right[index]) > 1e-9 {
				return left[index] < right[index]
			}
		}
		return entries[a].Sources > entries[b].Sources
	})
	for index := range entries {
		entries[index].Rank = index + 1
	}
	return entries
}

// tierMedian of tier values; an even count takes the mean of the middle two.
func tierMedian(values []float64) float64 {
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	middle := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[middle]
	}
	return (sorted[middle-1] + sorted[middle]) / 2
}
