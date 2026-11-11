package main

import (
	"os"
	"testing"
)

func TestContextContract(t *testing.T) {
	p := os.Getenv("CONTEXT_IGNORE")
	if p == "" {
		p = "../../.dockerignore"
	}
	m, err := matcher(p)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"docs/reports/capture.png", "docs/design/reference/design-lock.json", "tasks/plan.md", "scraper/parsers/main.py", "scripts/build-speed/context.go", ".env", "apps/web/.env.local", "nested/.env.production", ".npmrc", "apps/web/.npmrc", "apps/web/.next/cache/og/card.jpg", "apps/web/.next-test/server.js", "apps/web/node_modules/module/index.js"} {
		excluded, err := m.MatchesOrParentMatches(p)
		if err != nil || !excluded {
			t.Errorf("must exclude %s: %v", p, err)
		}
	}
	for _, p := range []string{"package.json", "package-lock.json", "scripts/patch-next.mjs", "apps/web/package.json", "packages/atlas-ui/package.json", "packages/game-data/package.json", "backend/api/openapi.yaml", "backend/go.mod", "backend/internal/server.go", "infra/simc/gear-metadata.patch", "apps/web/app/page.tsx", "apps/web/tests/atlas/test.ts", "apps/web/public/maps/terrain/1/tile.webp", "apps/web/public/assets/og/fonts/inter-400.ttf", "apps/web/public/brand/wowarcana-logo.png", "apps/web/public/ui-blueprints/games/test.webp", "apps/web/lib/og/atlasOg.tsx"} {
		excluded, err := m.MatchesOrParentMatches(p)
		if err != nil || excluded {
			t.Errorf("must retain %s: %v", p, err)
		}
	}
}

func TestInvalidationAndPublicIntegrity(t *testing.T) {
	p := os.Getenv("CONTEXT_IGNORE")
	if p == "" {
		p = "../../.dockerignore"
	}
	m, err := matcher(p)
	if err != nil {
		t.Fatal(err)
	}
	entries := []Entry{{"100644", "blob", "aaa", "apps/web/app/page.tsx", 12}, {"100644", "blob", "bbb", "docs/report.md", 99}, {"100644", "blob", "ccc", "apps/web/public/maps/terrain/1.webp", 44}}
	original, err := inventory(entries, m)
	if err != nil {
		t.Fatal(err)
	}
	entries[1].OID = "changed-doc"
	doc, _ := inventory(entries, m)
	if original != doc {
		t.Fatal("excluded doc invalidated source")
	}
	entries[0].OID = "changed-code"
	code, _ := inventory(entries, m)
	if code.Fingerprint == original.Fingerprint {
		t.Fatal("code did not invalidate source")
	}
	entries[0].OID = "aaa"
	entries[2].OID = "changed-map"
	art, _ := inventory(entries, m)
	if art.Fingerprint == original.Fingerprint || art.PublicFingerprint == original.PublicFingerprint {
		t.Fatal("asset did not invalidate")
	}
	entries[2].OID = "ccc"
	entries[0].Mode = "100755"
	mode, _ := inventory(entries, m)
	if mode.Fingerprint == original.Fingerprint {
		t.Fatal("mode did not invalidate")
	}
	entries[0].Mode = "100644"
	entries[0].Path = "apps/web/app/other.tsx"
	renamed, _ := inventory(entries, m)
	if renamed.Fingerprint == original.Fingerprint {
		t.Fatal("rename did not invalidate")
	}
}
