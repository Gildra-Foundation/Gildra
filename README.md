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

## Commands

```bash
npm ci        # install
npm run dev   # dev server (port 3000)
npm run build # production build + typecheck
npm run start # serve production build
```

There is no separate `lint`/test script; `npm run build` is the required check.

## Notes

- Deploys automatically via Vercel on push to `master`.
- Design rules live in `.claude/skills/gildra-design-director/SKILL.md`; design tokens reference in `design.md`.
- A legacy pre-Next static prototype is preserved locally outside the repo (`legacy/index.html`); the current project does **not** run by opening an HTML file.
