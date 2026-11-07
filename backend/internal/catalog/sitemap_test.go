package catalog

import (
	"regexp"
	"strings"
	"testing"
)

func TestSitemapShardBounds(t *testing.T) {
	t.Parallel()
	lower, upper, err := sitemapShardBounds("0f")
	if err != nil {
		t.Fatal(err)
	}
	if got := lower.String(); got != "0f000000-0000-0000-0000-000000000000" {
		t.Fatalf("lower = %s", got)
	}
	if upper == nil || upper.String() != "10000000-0000-0000-0000-000000000000" {
		t.Fatalf("upper = %v", upper)
	}
	_, upper, err = sitemapShardBounds("ff")
	if err != nil || upper != nil {
		t.Fatalf("last shard should have no upper bound: %v, %v", upper, err)
	}
	if _, _, err := sitemapShardBounds("xyz"); err == nil {
		t.Fatal("invalid shard should fail")
	}
}

// The sitemap must list exactly what Get serves for en_US, otherwise search
// engines are sent to record pages that answer 404.
func TestSitemapEntriesQueryMirrorsPublicRecordGates(t *testing.T) {
	t.Parallel()
	for _, fragment := range []string{
		"entity.deleted_at IS NULL",
		"entity.published_version_id IS NOT NULL",
		"JOIN game_entity_versions version ON version.id=entity.published_version_id",
		"en.locale='en_US'",
		"ru.locale='ru_RU'",
		"registry.is_public",
		publicCatalogDisplayNamePredicate("en", "en"),
		publicCatalogUsabilityPredicate("entity", "version"),
		"en.name !~ '[А-Яа-яЁё]'",
		"COALESCE(NULLIF(en.slug,''),entity.canonical_slug)",
		"ORDER BY entity.id",
		"LIMIT 50001",
	} {
		if !strings.Contains(sitemapEntriesQuery, fragment) {
			t.Fatalf("sitemap query is missing %q:\n%s", fragment, sitemapEntriesQuery)
		}
	}
	for _, parameter := range regexp.MustCompile(`\$\d+`).FindAllString(sitemapEntriesQuery, -1) {
		if parameter != "$1" && parameter != "$2" && parameter != "$3" && parameter != "$4" {
			t.Fatalf("sitemap query binds unexpected %s", parameter)
		}
	}
}

// slugRu is the ru_RU slug Get returns, and only for genuine Russian names:
// not the locale_fallback case, no junk marker, no Latin letters (the web
// blanks those names).
func TestSitemapEntriesQueryRussianSlugOnlyForGenuineNames(t *testing.T) {
	t.Parallel()
	caseStart := strings.Index(sitemapEntriesQuery, "CASE WHEN")
	caseEnd := strings.Index(sitemapEntriesQuery, " END,")
	if caseStart < 0 || caseEnd < caseStart {
		t.Fatalf("slugRu CASE not found:\n%s", sitemapEntriesQuery)
	}
	slugRu := sitemapEntriesQuery[caseStart:caseEnd]
	for _, fragment := range []string{
		"NULLIF(ru.name,'') IS NOT NULL",
		"ru.name<>en.name OR EXISTS (",
		"observation.locale='ru_RU'",
		"ru.name !~* " + publicCatalogJunkNamePattern,
		"ru.name !~ '[A-Za-z]'",
		"THEN COALESCE(NULLIF(ru.slug,''),NULLIF(en.slug,''),entity.canonical_slug)",
	} {
		if !strings.Contains(slugRu, fragment) {
			t.Fatalf("slugRu expression is missing %q:\n%s", fragment, slugRu)
		}
	}
	if strings.Contains(slugRu, "ELSE") {
		t.Fatal("slugRu must be NULL when the Russian page is not genuine")
	}
}

// The localization proof must stay identical to the one that decides
// locale_fallback in publicEntitySelectTemplate.
func TestSitemapLocalizationProofMatchesPublicEntitySelect(t *testing.T) {
	t.Parallel()
	normalize := func(value string) string { return strings.Join(strings.Fields(value), " ") }
	proof := sitemapLocalizationProof("v.id", "{locale}")
	want := normalize(proof[strings.Index(proof, "FROM"):])
	if !strings.Contains(normalize(publicEntitySelectTemplate), want) {
		t.Fatalf("sitemap localization proof drifted from publicEntitySelectTemplate:\n%s", want)
	}
}
