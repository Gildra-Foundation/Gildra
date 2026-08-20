---
name: gildra-design-director
description: Design rules for the Gildra project (WoW gaming intelligence platform). MUST be applied whenever working on Gildra's homepage, frontend, components, layouts, design, WoW pages, tier lists, or guide pages — any change that affects how Gildra looks or feels.
---

# Gildra Design Director

Gildra is a **gaming product first and analytics product second**. Every visual decision must read as a premium gaming platform (Blizzard / Archon / Maxroll tier), never as a SaaS dashboard.

## Non-negotiable rules

1. **Never produce generic SaaS aesthetics.** No endless card grids, no `rounded-xl border p-6` boxes for everything, no purple AI glow, no glassmorphism everywhere, no SaaS hero (headline + two buttons on empty gradient).
2. **Never invent game icons.** If a real asset exists, retrieve it. Spec/class icons live in `public/assets/specs/` and `public/assets/classes/` (official Wowhead CDN copies). The `lib/gameAssets.ts` resolver is the single source of truth for name → file mapping. Extend the resolver, don't scatter paths.
3. **Use real game assets whenever possible** — class icons, spec icons, raid/expansion artwork. Game artwork is part of layout architecture, not decoration (see hero and Current Raid banner: art defines composition).
4. **Do not wrap every section in cards.** Group with whitespace, typography, dividers, background shifts, artwork, lists, tables, rails.
5. **Every major landing page needs a strong visual focal point** — currently the cinematic hero with real Midnight artwork (`bg.jpg`) and the S-tier spotlight.
6. **Use brand gold sparingly**: logo, active nav, key indicators, separators, selected states, primary CTA. Never flood the UI with gold. CSS vars are still named `--gold/--gold-2/--gold-dim`.
7. **Class colors are contextual secondary accents only**: edge accents, icon halos, spotlight tints (see `.mspot` red DK edge). Never fill whole cards with class color.
8. **Information-dense and fast.** Data values must read instantly: tabular-nums, Chakra Petch for numbers/display, Inter for body. Uppercase only for small labels/tier/season/category indicators.
9. **Signature elements** (keep consistent): faceted octagon slots for spec icons, cut-corner plates with engraved inner frame, diamond bullets, thin gold ornamental rules, live data ticker.
10. **Motion is restrained**: opacity/transform only, 150–300ms UI transitions, slow hero zoom, section reveals with a 2.2s fallback that guarantees content is never hidden. Always respect `prefers-reduced-motion`.
11. **Never fake data.** All numbers come from the project's dataset (42,841 runs sample). No invented popularity, rankings or live counters.
12. **Always inspect the rendered page before declaring design complete.** Screenshot desktop (1440) and mobile (390) minimum: `npx playwright screenshot --viewport-size=1440,1000 --full-page <url> out.png`. The built-in browser pane can wedge on scroll — prefer Playwright CLI.

## Architecture facts

- The site is a **Next.js 15 + React 19 + TypeScript** App Router project, statically prerendered. Structure: `app/` (layout, `page.tsx` — homepage, `tier-lists/page.tsx` — full tier list route, globals.css), `components/` (TopNav — client, Explore/game dropdowns + burger; Hero + PatchHighlights — mobile accordion; SectionNav — client rAF scrollspy; MythicMeta, MetaTrends — open column, RaidFeature, GuidesSection, TierPreview — homepage preview, TierSection — full experience on /tier-lists, Footer, Reveal, SpecSlot, Icons), `data/site.ts` (the single dataset), `lib/gameAssets.ts` (asset resolver), `public/` (bg.jpg + assets/specs + assets/classes).
- All styling lives in `app/globals.css` (token-based, class names shared with components). No Tailwind, no CSS-in-JS — keep it that way unless asked.
- Fonts via `next/font/google` (Chakra Petch → `--font-display`, Inter → `--font-ui`); artwork and icons via `next/image`.
- Deploy = `git push` to `master` of `Gildra-Foundation/design` (Vercel auto-builds Next.js → gildra.vercel.app). Verify locally first: `npm run build` must pass with zero TS errors.
- Background separation is a hard rule: artwork lives only in the hero and the Current Raid break; the body is a calm `--bg` data surface (never full-page fixed artwork under tables).
- Navigation roles: the global header owns product-level wayfinding (Explore menu); the contextual `.secnav` owns only real homepage sections. Never render two parallel anchor rows.
- Homepage carries a compact Tier List preview; the full interface (filters, chips, detail panel) belongs to `/tier-lists`. Do not move it back.
- Controls must be honest: real `Link`/anchor targets, or explicit `.dead-link`/`.soon` prototype states — no `href="#"` pretenders.
- Tokens live in `:root`; tier colors (S red / A amber / B green / C blue) are data semantics — never restyle them as decoration.
- Full token reference: [design.md](../../../design.md). Legacy static version preserved locally in `legacy/index.html`.
