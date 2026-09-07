package catalog

import (
	"strings"
	"testing"
)

func TestPublicCatalogUsabilityPredicateFailsClosedForMidnightItems(t *testing.T) {
	t.Parallel()
	predicate := publicCatalogUsabilityPredicate("entity", "version")
	for _, fragment := range []string{
		"catalog_entity_expansions midnight_membership",
		"midnight.expansion_key='midnight'",
		"midnight_membership.build_id=version.build_id",
		"catalog_entity_usability usability",
		"usability.decision='eligible'",
	} {
		if !strings.Contains(predicate, fragment) {
			t.Fatalf("quality gate predicate is missing %q: %s", fragment, predicate)
		}
	}
	if strings.Contains(predicate, "decision<>'eligible'") {
		t.Fatal("quality gate must explicitly allow only the eligible decision")
	}
}

func TestPublicCatalogUsabilityPredicateSupportsDistinctAliases(t *testing.T) {
	t.Parallel()
	predicate := publicCatalogUsabilityPredicate("e", "v")
	if !strings.Contains(predicate, "e.product_id") || !strings.Contains(predicate, "v.build_id") {
		t.Fatalf("quality gate did not use supplied aliases: %s", predicate)
	}
}
