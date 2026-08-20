# Gildra — project guidance for Claude Code

Gildra is a WoW gaming-intelligence product: **gaming product first → decision
tool second → analytics dashboard third**. Production: https://gildra.vercel.app

## Stack & map

- Next.js 15 App Router + React 19 + TypeScript, static prerender.
- Routes: `app/page.tsx` (homepage), `app/tier-lists/page.tsx` (full tier list
  workspace), `app/specs/[slug]/page.tsx` (10 static spec pages from
  `lib/specs.ts`), `app/privacy/page.tsx`, `app/not-found.tsx` (branded 404),
  plus a full static Russian mirror under `app/ru/**` (UI strings via
  `lib/i18n.ts`; game terms stay English; links through `p(lang, href)`).
  Homepage stays an overview with a compact Tier Preview; the full
  filters/table/detail experience lives only on `/tier-lists`. Never embed the
  full workspace back into the homepage.
- All styling: `app/globals.css` (plain CSS, tokens in `:root`). No Tailwind,
  no CSS-in-JS.
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

- Project checks: `npm run build` (includes typecheck; there is no separate
  lint/test script). Dev: `npm run dev`; prod-like: `npm run start`;
  screenshots: `npm run design:capture`.
- Commit, push and deploy happen **only with the user's explicit permission**
  (push to `master` auto-deploys via Vercel).
- More context: [README.md](README.md).
