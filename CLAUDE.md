# Gildra — project guidance for Claude Code

Gildra is a WoW gaming-intelligence product: **gaming product first → decision
tool second → analytics dashboard third**. Production: https://gildra.net

## Stack & map

- Next.js 16 App Router + React 19 + TypeScript, Go 1.26 API/River worker,
  Payload CMS, PostgreSQL, ClickHouse and Redis.
- Routes: `app/page.tsx` (homepage), `app/tier-lists/page.tsx` (full tier list
  workspace), `app/specs/[slug]/page.tsx` (10 static spec pages from
  `lib/specs.ts`), `app/privacy/page.tsx`, `app/not-found.tsx` (branded 404),
  plus a full static Russian mirror under `app/ru/**` (UI strings via
  `lib/i18n.ts`; game terms stay English; links through `p(lang, href)`).
  Homepage stays an overview with a compact Tier Preview; the full
  filters/table/detail experience lives only on `/tier-lists`. Never embed the
  full workspace back into the homepage.
- Styling: existing Gildra tokens and components remain in `app/globals.css`;
  new UI uses Tailwind CSS and shadcn/ui without changing the visual language.
- Components: `components/` (TopNav, Hero, PatchHighlights, SectionNav,
  MetaPulse, MythicMeta, MetaTrends, RaidFeature, GuidesSection, TierPreview,
  TierSection, SearchCommand, Footer, Reveal, SpecSlot, Icons).
- Data: `data/site.ts` is the **only** dataset. Game icons/artwork resolve
  **only** through `lib/gameAssets.ts` (files in `public/assets/**`, hero/raid
  artwork `public/bg.jpg`). Never invent data, links or game assets.

## Hard design rules

- Different backgrounds are non-negotiable: cinematic artwork hero, solid
  `--bg` data body. No full-page fixed artwork.
- Honest UI only: no `href="#"`; unimplemented things use `.soon`,
  `.dead-link`, `aria-disabled` states.
- Full rules live in [design.md](design.md) — **read it before any UI/design
  work** and follow the `gildra-design-director` skill workflow
  ([.claude/skills/gildra-design-director/SKILL.md](.claude/skills/gildra-design-director/SKILL.md)).

## Working on UI

1. Check current render and `git diff` first; never redesign blind.
2. Design tasks require baseline and final screenshots
   (`npm run design:capture`, matrix 1440/1280/768/390 for `/` and
   `/tier-lists`), plus a critique → fix pass.
3. Audit-only requests use the `design-review` agent
   ([.claude/agents/design-review.md](.claude/agents/design-review.md)).
4. Figma is used only when the user provides a concrete frame/node link (or an
   explicit Figma task) and the plugin is authorized. Context7 is for current
   Next.js/React/Playwright docs — not for product decisions.

## Checks & permissions

- Project checks: `npm run typecheck && npm run build`, CMS build in `cms/`,
  and `go vet ./... && go test ./...` in `backend/`. Dev: `npm run dev`; prod-like: `npm run start`;
  screenshots: `npm run design:capture`.
- Commit, push and deploy happen **only with the user's explicit permission**
  (successful CI on `master` deploys to OVHcloud).
- More context: [README.md](README.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
