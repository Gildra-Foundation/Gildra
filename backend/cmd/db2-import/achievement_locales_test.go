package main

import "testing"

func TestAchievementTextTablesImportBothLocales(t *testing.T) {
	for _, table := range []string{"Achievement", "Achievement_Category", "CriteriaTree"} {
		if !isLocalized(table) {
			t.Errorf("%s contains localized player-facing text", table)
		}
	}
}
