package catalog

import "regexp"

var expansionKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,63}$`)

// Expansion scope is opt-in. Membership must be confirmed for the exact
// published build, never inferred from item level or a localized name.
func validateExpansion(product, expansion string) error {
	if expansion == "" {
		return nil
	}
	if !expansionKeyPattern.MatchString(expansion) {
		return invalidRequest("expansion must be a lowercase registry key")
	}
	return nil
}

func expansionPredicate(expansion, entity, version, placeholder string) string {
	if expansion == "" {
		return ""
	}
	return ` AND EXISTS (SELECT 1 FROM catalog_entity_expansions membership
 JOIN catalog_expansions expansion ON expansion.id=membership.expansion_id
 WHERE expansion.expansion_key=` + placeholder + ` AND expansion.product_id=` + entity + `.product_id AND membership.classification='confirmed'
 AND membership.product_id=` + entity + `.product_id
 AND membership.entity_type=` + entity + `.entity_type
 AND membership.external_id=` + entity + `.external_id
 AND membership.build_id=` + version + `.build_id) `
}
