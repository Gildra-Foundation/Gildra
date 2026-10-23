package catalog

import (
	"regexp"
	"strings"
	"testing"
)

// List and Get bind different parameter numbers, so the shared entity SELECT
// must refer to the locale only through its placeholder. A hard-coded `$2`
// once made List join quest-reward item names on the type filter instead of
// the locale, so Russian lists showed English item names.
func TestPublicEntitySelectBindsOnlyTheLocaleParameter(t *testing.T) {
	query := publicEntitySelect("$9", "LEFT JOIN extra ON true\n")
	for _, parameter := range regexp.MustCompile(`\$\d+`).FindAllString(query, -1) {
		if parameter != "$9" {
			t.Fatalf("shared entity SELECT binds %s; only the locale placeholder is allowed", parameter)
		}
	}
	if strings.Contains(query, "{locale}") || strings.Contains(query, "{extraJoins}") {
		t.Fatal("placeholders were not substituted")
	}
	if !strings.Contains(query, "item_name.locale=$9") {
		t.Fatal("quest reward item names must join on the requested locale")
	}
	if !strings.Contains(query, "JOIN game_products p ON p.id = e.product_id\nLEFT JOIN extra ON true\n") {
		t.Fatal("extra joins must follow the product join")
	}
}
