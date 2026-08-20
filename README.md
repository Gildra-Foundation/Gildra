# Gildra — Master the Meta

WoW gaming-intelligence concept: live tier lists, Mythic+/Raid meta statistics, builds and guides.

**Production:** https://gildra.vercel.app

## Stack

- Next.js 15 (App Router, static prerender) + React 19 + TypeScript
- Plain CSS with design tokens in `app/globals.css` (no Tailwind, no CSS-in-JS)
- Demo dataset in `data/site.ts`; official WoW spec/class icons resolved via `lib/gameAssets.ts` (`public/assets/`)
- Images via `next/image`; fonts via `next/font/google` (Chakra Petch + Inter)

## Routes

- `/` — homepage: cinematic hero, contextual section nav, Mythic+ meta snapshot, Current Raid feature, guides, compact tier-list preview
- `/tier-lists` — full Mythic+ tier list experience (filters, class chips, search, table, featured builds, spec detail panel)
- `/specs/[slug]` — permanent spec pages (statically generated from `data/site.ts` via `lib/specs.ts`)
- `/privacy` — privacy policy (linked from the footer and the cookie notice)
- custom branded 404 for everything else
- `/ru`, `/ru/tier-lists`, `/ru/specs/[slug]`, `/ru/privacy` — static Russian mirror (interface strings via `lib/i18n.ts`; game terms stay English); EN/RU switcher in the header

Social preview: `app/opengraph-image.png`, regenerated with `node scripts/generate-og.mjs`.

## Commands

```bash
npm ci        # install
npm run dev   # dev server (port 3000)
npm run build # production build + typecheck
npm run start # serve production build
```

There is no separate `lint`/test script; `npm run build` is the required check.

## Design workflow & AI tooling

- [`design.md`](design.md) — the living design contract (identity, tokens,
  patterns, states, Definition of Design Done).
- [`CLAUDE.md`](CLAUDE.md) — always-on project guidance for Claude Code.
- `gildra-design-director` (`.claude/skills/`) — implementation workflow for
  any UI change; `design-review` (`.claude/agents/`, `/design-review-pro`) —
  evidence-first audit workflow.
- `.mcp.json` — project-scoped MCP servers: **Playwright** (pinned
  `@playwright/mcp@0.0.79`, isolated, artifacts in `.artifacts/playwright/`)
  and **Context7** (current Next/React/Playwright docs). First use requires a
  one-time project trust approval; check with `/mcp` or `claude mcp list`.
- `npm run design:capture` — deterministic screenshot matrix (`/` and
  `/tier-lists` × 1440/1280/768/390, viewport + full-page) into `.artifacts/`.
  Set `DESIGN_BASE_URL` to point at a running server (default
  `http://127.0.0.1:3000`). Browsers install once via `npx playwright install chromium`.

### Figma (optional, one-time user setup)

The plugin needs OAuth and cannot be enabled by a repository commit:

```bash
claude plugin install figma@claude-plugins-official
```

Then: restart Claude Code → open `/plugin` → authorize Figma → verify the
connection. For design-to-code, share a link to a **specific selected
frame/node**, not just the file URL.

## Notes

- Deploys automatically via Vercel on push to `master` (with explicit user
  permission).
- A legacy pre-Next static prototype is preserved locally outside the repo
  (`legacy/index.html`); the current project does **not** run by opening an
  HTML file.
