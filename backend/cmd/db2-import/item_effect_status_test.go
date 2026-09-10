package main

import (
	"strings"
	"testing"
)

func TestItemEffectDB2ProjectionPersistsSpellTargetStatus(t *testing.T) {
	for _, fragment := range []string{
		"spell_name,spell_target_status",
		"table_name='SpellName'",
		"CASE WHEN spell_name.row_id IS NULL THEN 'unavailable_in_build' ELSE 'resolved' END",
	} {
		if !strings.Contains(itemDetailsProjectionSQL, fragment) {
			t.Fatalf("DB2 item projection missing spell target status fragment %q", fragment)
		}
	}
}
