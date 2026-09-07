package catalog

import (
	"strings"
	"testing"
)

func TestPublicCatalogUsabilityPredicateHidesNonEligibleItems(t *testing.T) {
	t.Parallel()
	predicate := publicCatalogUsabilityPredicate("entity", "version")
	for _, fragment := range []string{
		"catalog_entity_usability usability",
		"usability.decision <> 'eligible'",
		"(entity.product_id,version.build_id,entity.external_id) NOT IN",
	} {
		if !strings.Contains(predicate, fragment) {
			t.Fatalf("quality gate predicate is missing %q: %s", fragment, predicate)
		}
	}
	if strings.Contains(predicate, "catalog_entity_expansions") {
		t.Fatal("quality gate must not scan expansion membership for every catalog row")
	}
}

func TestPublicCatalogUsabilityPredicateSupportsDistinctAliases(t *testing.T) {
	t.Parallel()
	predicate := publicCatalogUsabilityPredicate("e", "v")
	if !strings.Contains(predicate, "e.product_id") || !strings.Contains(predicate, "v.build_id") {
		t.Fatalf("quality gate did not use supplied aliases: %s", predicate)
	}
}
