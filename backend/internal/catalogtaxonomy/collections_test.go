package catalogtaxonomy

import (
	"strings"
	"testing"
)

func TestCollectionSQLScopesPublishedBuilds(t *testing.T) {
	for name, q := range map[string]string{"details": collectionDetailsSQL, "links": collectionLinksSQL} {
		scoped := projectionSQL(q)
		if !strings.Contains(scoped, "release.published_at IS NOT NULL") || !strings.Contains(scoped, "published_version_id") {
			t.Fatalf("%s lacks publication guard", name)
		}
	}
}
