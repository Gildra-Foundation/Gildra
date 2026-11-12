package catalog

import "strings"

// Expansion scope is opt-in. Membership must be confirmed for the exact
// published build, never inferred from item level or a localized name.
func validateExpansion(product, expansion string) error {
	if expansion == "" {
		return nil
	}
	if expansion != "midnight" || (strings.TrimSpace(product) != "" && strings.TrimSpace(product) != "wow") {
		return invalidRequest("expansion must be midnight and product must be wow")
	}
	return nil
}

func expansionPredicate(expansion, entity, version string) string {
	if expansion == "" {
		return ""
	}
	// Only the fixed public scope is accepted; no request text enters SQL.
	if expansion != "midnight" {
		return " AND false "
	}
	return ` AND EXISTS (SELECT 1 FROM catalog_entity_expansions membership
 JOIN catalog_expansions expansion ON expansion.id=membership.expansion_id
 WHERE expansion.expansion_key='midnight' AND membership.classification='confirmed'
 AND membership.product_id=` + entity + `.product_id
 AND membership.entity_type=` + entity + `.entity_type
 AND membership.external_id=` + entity + `.external_id
 AND membership.build_id=` + version + `.build_id) `
}
