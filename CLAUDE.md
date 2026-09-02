# Gildra — project guidance for Claude Code

Gildra is a WoW gaming-intelligence product: **gaming product first → decision
tool second → analytics dashboard third**. Production: https://gildra.net

## Stack & map

- Next.js 16 App Router + React 19 + TypeScript, Go 1.26 API/River worker,
  Payload CMS, PostgreSQL, ClickHouse and Redis.
- **Pages are configs of blocks.** Page definitions live in
  `lib/games/<slug>/pages/*.ts` (`definePage` → `{ en, ru }`); route files
  `app/**/page.tsx` and their `app/ru/**` mirrors are three-line wrappers.
  Blocks live in `components/blocks/<game|shared>/<name>/` and are mapped in
  `lib/blocks/registry.ts`. Chrome (Icons, TopNav, `.app/.main`, Footer, Reveal)
  comes only from `components/layout/PageShell.tsx`. The full contract, plus
  "add a block / page / game" recipes, is in
  [components/blocks/README.md](components/blocks/README.md) — read it before UI work.
- CMS: a published Payload `pages` document with `slug` = page id and a
  `blocks` JSON overrides that page's block list (`lib/cms/pages.ts`,
  validated against the registry, fails open to the TS config).
- Games: `lib/games/registry.ts` is the single source of game identity, URL
  prefix (WoW = site root, others `/<slug>/`), nav tasks, footer and legal
  text; TopNav/Footer/SearchCommand read it. Never add `app/[game]`.
- Block pages so far: WoW home, `/tier-lists` (one `wow.tierWorkspace` block
  around `components/TierSection.tsx`), `/specs/[slug]`, `/privacy`, and all of
  `/league-of-legends/**` (+ `/ru` mirrors). `/database`, `/library` and
  `app/not-found.tsx` are app pages that only use `PageShell`. UI strings via
  `lib/i18n.ts` (`t`, `tNav`); game terms stay English; links through
  `p(lang, href)` / `gameHref`; anchors through `lib/anchors.ts`.
  Homepage stays an overview with a compact Tier Preview; the full
  filters/table/detail experience lives only on `/tier-lists`. Never embed the
  full workspace back into the homepage.
- Styling: `app/globals.css` is only an ordered `@import` index; tokens in
  `app/styles/tokens.css`, shared rules in `app/styles/*.css`, each legacy
  block's CSS next to the block. Class names are never renamed; block-level
  compaction uses `@container` (containers: `.section`, `.cards-row`); new UI
  uses Tailwind CSS and shadcn/ui on the same tokens without changing the
  visual language.
- Data: blocks read data only through `ctx.source` (`lib/data/source.ts`);
  `data/site.ts` is the demo dataset behind it and the only source for
  `demo.ts` files. Game icons/artwork resolve **only** through
  `lib/games/wow/assets.ts` (files in `public/assets/**`, hero/raid artwork
  `public/bg.jpg`). Never invent data, links or game assets.

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
  screenshots: `npm run design:capture -- --deterministic`, pixel gate:
  `npm run design:compare <baseline> <run>` (0 px + no overflow on `/`, `/ru`,
  `/tier-lists`), block gallery: `/dev/blocks` (`--blocks` captures every block).
- Commit, push and deploy happen **only with the user's explicit permission**
  (successful CI on `master` deploys to OVHcloud).
- More context: [README.md](README.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
