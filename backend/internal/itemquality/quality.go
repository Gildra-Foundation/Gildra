// Package itemquality normalizes the numeric DB2 and named Blizzard quality enums.
package itemquality

import "strings"

var names = []string{"POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT", "HEIRLOOM", "WOW_TOKEN"}

// SQL returns an integer expression, preserving unknown quality as NULL.
// column must be a trusted SQL expression, never user input.
func SQL(column string) string {
	var b strings.Builder
	b.WriteString("CASE upper(btrim(" + column + "))")
	for n, name := range names {
		digit := string(rune('0' + n))
		b.WriteString(" WHEN '" + digit + "' THEN " + digit + " WHEN '" + name + "' THEN " + digit)
	}
	b.WriteString(" END")
	return b.String()
}
