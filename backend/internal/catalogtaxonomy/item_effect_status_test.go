package catalogtaxonomy

import (
	"strings"
	"testing"
)

func TestItemEffectTooltipProjectionCarriesBuildScopedSpellStatus(t *testing.T) {
	for _, fragment := range []string{
		"table_name='SpellName'",
		"spell_target_status",
		"unavailable_in_build",
		"Effect unavailable in this build.",
		"Эффект недоступен в данных этой сборки.",
		"CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text))",
	} {
		if !strings.Contains(tooltipSQL, fragment) {
			t.Fatalf("tooltip projection missing item-effect status fragment %q", fragment)
		}
	}
}
