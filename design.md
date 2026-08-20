# Gildra Design System — Gaming Intelligence for Azeroth

```text
Status:            Active (living document — update together with the product)
Applies to:        all Gildra product UI
Code baseline:     c180299 (V2.2) + infra baa4564
Last verified:     2026-08-20
Figma:             https://www.figma.com/design/Vm1gZ9opYvUvxKCZIKY2Pq
Executable tokens: app/globals.css
```

History lives in Git. This file describes the **current** product only.

---

## A. Product identity

Gildra is a **premium World of Warcraft gaming-intelligence product** for players
who need fast, trustworthy answers: *what is strong this season, what should I
play, how do I build it, what changed*. Its users are Mythic+ and raid players
making decisions between runs — not analysts studying dashboards.

What separates Gildra from a generic analytics dashboard:

- it opens like a game, not like a SaaS admin panel;
- real game assets (official spec/class icons, expansion artwork) are structural
  material, not decoration;
- data is dense but ranked and opinionated — the product takes a position
  (spotlight, tiers, pulse) instead of dumping tables.

Formula, in priority order:

> **gaming product first → fast decision tool second → analytics dashboard third.**

## B. Design principles

1. **Cinematic entry, calm data body.** The hero is the only full-artwork zone;
   the body is a quiet solid surface for reading.
   *Why:* atmosphere sells the game; calm surfaces sell the data.
   **Do:** keep hero artwork + tonal fade into `--bg`.
   **Do not:** put image backgrounds under long tables.

2. **Information-dense, not card-dense.** Density comes from typography and
   rows, not from boxes.
   *Why:* frames multiply visual noise faster than content.
   **Do:** open rows, dividers, section surfaces (`.metaopen`, `.trendside`, `.tpv-rows`).
   **Do not:** wrap every block in a framed card; no card-inside-card.

3. **Authentic game assets over invented decoration.**
   *Why:* invented glyphs read as AI filler; real icons read as WoW.
   **Do:** resolve every spec/class icon through `lib/gameAssets.ts`.
   **Do not:** draw fake game icons, use emoji, or hotlink random images.

4. **Task-first navigation.** Users pick an action (compare specs, find a
   build), not a sitemap category.
   *Why:* Gildra is a decision tool.
   **Do:** keep Explore as the 2×2 task grid; contextual nav = real sections only.
   **Do not:** render two parallel anchor rows or duplicate Explore in SectionNav.

5. **Data honesty.** Every number is from `data/site.ts`; every control either
   works or is visibly a prototype.
   **Do:** label demo data (`Season 1 · demo data`), use `.soon`/`.dead-link`/`.tool-static`.
   **Do not:** invent live metrics, fake `href="#"` links, or ARIA roles without behavior.

6. **One focal point per major section.** Spotlight in Meta, artwork in Raid,
   featured article in Guides, S-row in the tier table.
   **Do:** let supporting content step back (smaller, open layout).
   **Do not:** make every element equally loud.

7. **Visual verification before completion.** A green build is not design-done.
   **Do:** capture and critique the real render (see §M).
   **Do not:** ship from JSX/CSS reading alone.

## C. Source-of-truth hierarchy

1. Current working product behavior and user flow.
2. `design.md` — canonical intent and rules (this file).
3. `app/globals.css` — executable token values.
4. Existing components — current implementation patterns.
5. Figma node/frame — visual target **only** when the user supplies a concrete link.
6. External references (Blizzard, Archon, Maxroll) — inspiration level, never copied.

If this file and the CSS disagree, do not silently pick one: determine which
state is intentional, then synchronize the other inside the task at hand.

## D. Foundations (extracted from `app/globals.css`)

### Surfaces
| Token | Value | Role |
|---|---|---|
| `--bg` | `#0b0d13` | page/body base (plus faint top radial `#10141f`) |
| `--panel` | `#12151e` | contained surfaces |
| `--panel-2` | `#171b26` | nested/elevated surfaces, sheets |
| `--raise` | `#1c2130` | hover surface |
| `#0d1017` | — | rails/sidebars (tier workspace) |
| `#10131c` | — | inputs, selects, menu panels |
| `--line` / `--line-soft` | `#232837` / `#1c212e` | borders / dividers |

### Text
`--ink #e9ecf3` (primary) · `--ink-2 #98a2b6` (secondary) · `--ink-3 #7a86a0`
(muted, AA on panels) · `#eef0f8` / `#e9ecf7` (display headings).

### Accent
| Token | Value | Role |
|---|---|---|
| `--gold` | `#c9a24f` | ornaments, bullets, active markers |
| `--gold-2` | `#e6c77a` | active nav, title accents, pulse tag |
| `--gold-dim` | `#8a733c` | muted gold borders, selected chips |
| gold CTA | `#edd28a→#c9a24f→#99793a`, border `#6b571f`, text `#251c07` | primary buttons |
| `--blue` / `--blue-2` | `#4d7dd6` / `#7ba6ee` | links, radar data |
| `--green` / `--red` | `#57ab63` / `#d95c55` | up/down trends only |

### Tier semantics (data, never decoration)
S `#5a2023→#42191b`/`#e88f80` · A `#514016→#3c2f12`/`#dfc06a` ·
B `#1e4527→#16331d`/`#82c08c` · C `#1e3a58→#16283e`/`#7fa9d6`.

### Class colors
Only inside spec slots and as contextual edge accents (e.g. `.mspot` red DK edge):
DK `#c41e3a`, Mage `#3fc7eb`, Evoker `#33937f`, Paladin `#f48cba`, Rogue `#fff468`,
Druid `#ff7c0a`, Priest `#dfe3e8`, Hunter `#aad372`, Shaman `#0070dd`,
Warlock `#8788ee`, Monk `#00ff98`, Warrior `#c69b6d`, DH `#a330c9`.

### Typography
- Display: **Chakra Petch** (`--font-display` via next/font, weights 500–700;
  700 is the maximum — never fake 800). Roles: hero H1 44/40, section titles
  22–27, tier letters, scores, CTAs, roman numerals.
- UI/body: **Inter** (`--font-ui`, 400–700), base 13px.
- Labels `.cap`: Inter 600 10px, tracking .16em, uppercase. Uppercase is
  reserved for small labels, tiers, season tags, contextual nav — never body copy.
- Numbers: `font-variant-numeric: tabular-nums` wherever data aligns.

### Dark-surface polish
`::selection` is gold-tinted; scrollbars are thin and dark (`#242a3a` thumb on
transparent track, webkit + `scrollbar-color`); native form controls inherit
`accent-color: var(--gold)`.

### Geometry & rhythm
- Radii 2–3px only (`--r-lg 3 / --r-md 2 / --r-sm 2`); plates use **cut corners**
  (clip-path bevels/octagons), not rounded cards.
- Content `max-width:1210px`, side padding 34 (20 on mobile).
- Header 54px; contextual nav 42px; anchor offset `scroll-margin-top:104px`.
- Breakpoints: **980** (header collapses to burger), **1120** (single column;
  tier workspace switches to mobile order), **720** (mobile refinements).
- Z-layers: content < `.secnav` 40 < header dropdowns 60 < mobile menu 70 <
  search dialog 90.
- Motion: 130–300ms ease for UI; hero zoom 38s scale 1→1.07; reveal 450ms
  opacity/translate with a 2.2s failsafe (content can never stay hidden); one
  280ms scaleX sweep for the nav underline. `prefers-reduced-motion` disables
  all of the above plus smooth scroll.

## E. Artwork system

- **Allowed:** hero (`/bg.jpg`, `object-position: 63% 22%`, `priority`) and the
  Current Raid chapter break (same asset today, crop `center 62%`, lazy).
- **Forbidden:** artwork under body/data surfaces; `background-attachment:fixed`
  full-page images; artwork behind the tier table.
- Readability: hero uses a left-to-right dark gradient plus a bottom tonal fade
  to `--bg`; text over art must stay AA.
- Crop rule: the focal character/object must not be cut arbitrarily — verify at
  1440 and 390 whenever a crop changes.
- Sources: only assets already in `public/` or explicitly licensed additions.
  Never download random images. Official spec/class icons are the Wowhead-CDN
  copies in `public/assets/**`, resolved exclusively through
  `lib/gameAssets.ts` (`specIcon`, `classIcon`) — never scatter asset paths.
- Missing asset → keep an honest typographic composition and record the gap in
  the task report. (Known gap: no dedicated raid artwork yet — RaidFeature
  reuses `/bg.jpg` with a different crop.)

> **Hard rule:** Hero and large editorial/raid breaks may use artwork; long
> data surfaces and tables never get a full-page image background.

## F. Signature visual language

- **Brand mark** — the black-and-gold spartan helmet (`public/brand/helmet.png`,
  transparent PNG; favicon `app/icon.png`). Used as `.logo-mark` in the header,
  footer and tier-list rail, always paired with the GILDRA wordmark (except the
  favicon). Never recolor it, put it on a light plate, or invent alternate marks.
  The social card `app/opengraph-image.png` (helmet + wordmark + season line) is
  regenerated with `node scripts/generate-og.mjs` — never hand-edit the PNG.
- **Gildra gold** — primary actions, active/current markers, thin ornaments. Sparingly.
- **Octagonal spec slots** (`.spec`: steel outer, class-gradient inner, real
  icon) — spec identity everywhere: meta, trends, pulse, table, builds, search.
- **Class-color contextual accents** — edges/tints only, never full fills.
- **Tier pills/cells** — octagon S/A/B/C with tier gradients.
- **Thin ornamental rules** — 1px gold-fade dividers under section heads.
- **Diamond bullets** (`.dia`) — list markers and link separators.
- **Cut-corner plates** — buttons, chips, menus, the search dialog.
- **Meta Pulse** (`.mpulse`) — gold bevel notch strip with top movers and an
  honest demo label. (`.pulse` is the small live dot — never reuse that class.)
- **Active navigation treatment** — gold text + gradient underline + one sweep.
- **Display numerals** — Chakra Petch scores with gold micro-bars (`.sbar`).

## G. Layout and page rhythm

Homepage: `header → cinematic hero → contextual nav → Meta Pulse → Meta
snapshot (spotlight + open trends) → Raid artwork break → Guides editorial →
compact Tier Preview (+builds) → footer`.
Rhythm: cinematic artwork → compact data → artwork break → editorial → compact
actionable data → footer.

| Pattern | Purpose | Desktop | Mobile | Density / never duplicate |
|---|---|---|---|---|
| Global header | wayfinding: logo, game, Explore, search, profile | one 54px row | burger + logo + WoW + avatar | never a second link row |
| Hero `#overview` | identity + value + CTA + live line | copy left, patch card right | patch = pill accordion; live stats 2×2 | one primary CTA |
| SectionNav | on-page wayfinding | season label + META/RAID/GUIDES/TIER LIST, sticky | `S1` + items, right edge fade | must not mirror Explore |
| Meta Pulse | movement at a glance | one strip: tag, 3 movers, count link | wraps to 2–3 lines | not a card; one per page |
| Meta snapshot `#meta` | decide what to play | open spotlight + runners + A/B/C rail ‖ open trends | single column, tight paddings | spotlight is the only big element |
| Raid break `#raid` | chapter change | artwork banner: links left, top specs right | stacked over art | second artwork moment, not third |
| Guides `#guides` | editorial | featured art + 4-row list | stacked | not a uniform card grid |
| Tier Preview `#tier-list-preview` | taste of ranking + CTA | 7 open rows + 4 builds + gold CTA | 5 rows + 2 builds | never the full workspace |
| `/tier-lists` workspace | full comparison tool | rail + table + detail aside | h1 → tabs → rows → `Filters · N`; detail behind toggle | only place with filters/detail |
| `/specs/[slug]` | permanent spec URL (10 pages from `tierTable` via `lib/specs.ts`) | crumb → class-edge hero (slot, h1, tier pill, score) → 5-cell stat strip → builds/guides → back link | stats 2×2+1, hero wraps | data identical to the table — never fork numbers |
| `/privacy` (`.legal`) | honest data policy | narrow 640px column | same | linked from footer + cookie notice |
| 404 (`.nf`) | branded dead-end | header + helmet, display "404", two exits | same | no artwork background |
| Footer | links, premium, legal | brand + columns + disclaimer + Privacy link | stacked | premium never dominates |

## H. Component anatomy and states

(Behavioral contract; implementation lives in `components/`.)

- **TopNav** — burger (≤980: `aria-expanded`, body scroll-lock, closes on
  select), logo → `/`, game selector (disclosure: "Switch game" cap, current game on a
  gold octagon tile with a diamond marker, other games on steel tiles as honest
  `soon` buttons), **Explore** (disclosure with a 2×2 task grid in the open-row
  style: octagon icon tiles, hairline cross divider with a center diamond —
  no framed cards; hover raise + gold tile; `.on` = exact current route only,
  with `aria-current="page"`, gold left edge and gold title; footer row is a
  real search trigger with `⌘K` hint; Esc closes and returns focus, outside
  click closes), search button (opens the dialog), profile button
  (labelled; no menu yet — do not fake one).
- **SearchCommand** — `role="dialog"` + `aria-modal`; opens on click and
  ⌘/Ctrl+K; local index over `data/site.ts` + `gameAssets`, grouped
  Specs/Classes/Builds/Raid/Guides/Pages; ↑ ↓ Home End roam, Enter navigates,
  Esc closes; focus trapped, then returned to the trigger; empty state; body
  scroll-lock while open.
- **Hero** — H1, sub, gold CTA → `/tier-lists`, text CTA → `/#raid`, live line
  (`.hl-badge` / `.hl-item` / `.hl-upd`).
- **PatchHighlights** — desktop: light card; mobile: collapsed pill button
  (`aria-expanded`) → accordion list + link.
- **SectionNav** — links with `aria-current="location"`; rAF scrollspy on `/`;
  route-aware active Tier List on `/tier-lists`; bottom-of-page activates the
  last section.
- **MythicMeta** (`.metaopen`) — spotlight (class-edge tint, S pill, trend),
  two runner rows, A/B/C octagon rail, foot line. No outer frame.
- **MetaTrends** (`.trendside`) — open ranked column, roman numerals,
  plain-text names (no fake links), bottom CTA.
- **MetaPulse** — §F; the link leads to `/tier-lists`.
- **RaidFeature** — artwork, title, honest links (`Tier List`, `Guides` real;
  `Boss Rankings`, `Best Specs` are `.dead-link` until routes exist), top specs.
- **GuidesSection** — featured card (hover art zoom) + rows; non-clickable
  until article routes exist (`cursor:default`; View-All is `.dead-link`).
- **TierPreview** — rank / tier pill / slot / name → `/tier-lists` /
  score + `.sbar` / pop / trend; build cards are real links to
  `/tier-lists#builds`.
- **TierSection** — the route `h1`; tabs (Overall current, others
  `aria-disabled` + title); period chip `.tool-static`; **Share** copies the
  URL (`Copied ✓`); `Filters · N` toggle (`aria-expanded/controls`) with
  removable `.fchip`s and a collapsible `filters-panel` (controlled selects and
  segments, honest demo note); spec search + class chips (octagon class icons,
  gold `.on`); table rows dim via opacity .14 (never `display:none` — rowSpan
  safety); `col-key`/`col-top` hidden ≤720; detail panel: static aside on
  desktop, behind a `View … details` toggle on mobile; detail tabs beyond
  Overview are `aria-disabled`; builds here are static (`.bcard-static`).
- **Footer** — real Content links, Community as `.dead-link`s, `#premium` anchor,
  Privacy Policy link in the legal line.
- **CookieNotice** — fixed cut-corner plate (bottom-left, z 80): honest copy,
  Accept (gold) / Decline (text), link to `/privacy`; the choice persists in
  `localStorage["gildra-consent"]` and the notice never returns after either
  choice. No trackers are loaded regardless of the answer today.

States vocabulary: default · hover (`--raise` surface / gold text) ·
`:focus-visible` (2px `--gold-2` outline; cut-corner controls with `clip-path`
— `.gsw-btn`, `.btn`, chips — use an **inset** `box-shadow` ring instead, since
`clip-path` crops an outer outline into fragments; on gold-filled buttons the
ring is dark `#4a3a10`) · active/current (gold + underline /
`.on`) · selected (gold-tinted chip) · disabled (`aria-disabled`, 45% opacity,
`not-allowed`) · coming soon (`.soon` chip / `.dead-link`) · open/closed
(`aria-expanded`) · empty (search “No results”). Loading/error states do not
exist yet (static prerender) — do not fake them.

## I. Responsive rules

- ≤980: header collapses — nav tasks and search move into the burger; game
  label shortens to “WoW”; profile becomes avatar-only.
- ≤1120: sections go single-column; the tier workspace hides its rail — order
  becomes **h1 → tabs → first rows → `Filters · N` toggle**; the detail panel
  hides behind its toggle.
- ≤720: patch pill accordion; live stats 2×2; season label `S1`; preview trims
  to 5 rows / 2 builds; the table drops Avg Key and Top 1%; secnav gets a right
  edge fade; side padding 20.
- Data priority on small screens: rank, spec identity, score, trend stay;
  secondary metrics hide.
- Touch targets ≥ ~44px for primary controls; chips ≥ 28px with spacing.
- Horizontal page overflow at 390/768/1280/1440 is a release blocker; fix the
  wide element — never mask with `overflow-x:hidden`.
- Mobile tables: hide columns or compact the rows; never `transform: scale()`.

QA matrix (minimum): `1440×1000`, `1280×900`, `768×1024`, `390×844`.

## J. Data visualization and content rules

- Tabular numerals; display-font scores with `.sbar` micro-bars
  (width = (score − 70) / 25 × 100%).
- Trends: ▲ green / ▼ red / — muted, always paired with a number or label —
  color is never the only signal.
- Tier letters are semantics; roman numerals mark popularity ranks.
- Freshness labels come from data (`updated 2h ago`); demo data is labelled
  (“Season 1 · demo data”, “Demo dataset — … not wired yet”). Never claim
  “live” without a live source; never invent metrics, authors or timestamps.
- Compact rows/tables for rankings; cards only for standalone interactive
  entities (build links, featured guide).
- Copy: sentence case, active verbs (“View full tier list”), consistent terms
  (spec, tier, build, guide, season, patch). No slogans inside data UI.

## K. Accessibility and interaction contract

Semantic headings (one `h1` per route) · full keyboard flow for header, menus,
search, filters and toggles · focus returns to the trigger on close ·
dialog/menu semantics only where the behavior is implemented · Esc closes
temporary surfaces · scroll-lock is always removed on close · visible
`:focus-visible` everywhere · AA text contrast (muted text ≥ `--ink-3`) ·
meaningful `alt`, decorative `alt=""` · `prefers-reduced-motion` honored ·
the reveal failsafe keeps content visible · no `href="#"`; prototypes are
`.soon` / `.dead-link` / `aria-disabled` with explanatory titles.

## L. Anti-patterns (never ship)

Generic SaaS hero · endless framed cards / card-in-card · purple AI glow ·
glassmorphism everywhere · emoji UI · invented glyphs or fake game assets ·
arbitrary gradient blobs · gold flooding · motion for its own sake · duplicated
navigation rows · a full product workspace embedded in the homepage · desktop
UI scaled down to mobile · numbered markers (01/02/03) as decoration.

## M. Definition of design done

```text
inspect current render
→ capture baseline (npm run design:capture or Playwright MCP)
→ identify the hierarchy/flow problem
→ implement the minimal change
→ npm run build
→ capture the same states/viewports
→ critique the visible result (not the code)
→ fix regressions
→ keyboard/accessibility pass
→ report with evidence (screenshots, measured heights, checks)
```

A green build without render verification is **not** design done.
