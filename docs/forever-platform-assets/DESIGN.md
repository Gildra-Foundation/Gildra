# Forever platform — unified design (2026-11-11)

Design spec for the expanded **World of Warcraft: Forever** section: library, talent calculator, classes and changes,
professions, tier lists, plus the existing hub, dungeons and raids. Audience: the four implementation tracks
(DATA, TALENTS, CLASSES, GUIDES) and the release coordinator. Asset generation: [CODEX-PROMPTS.md](CODEX-PROMPTS.md),
machine list [assets.spec.json](assets.spec.json), kit spec [forever.spec.json](forever.spec.json).

Binding sources (read, not restated): `docs/design/reference/README.md` (fixed M+/meta/raids — never changed by this work),
skills `gildra-wow-material-design` (design.md §0–§12, assets.md), `gildra-clean-ui`, `gildra-asset-imagegen`,
`packages/atlas-ui/README.md`. Paths below are relative to `apps/web/` unless absolute.

---

## 0. Decisions (one line each)

1. **One Forever kit.** New slim section kit `forever` (pewter + brass compass caps + pine-green enamel, site accent `#9cc0a0`):
   panel, button, icon frame, one ornament. It replaces the two borrowed M+ kits (`den-of-nalorakk`, `kings-rest`) on every
   Forever page. Today the hub mixes bear-claw and Zandalari caps — two foreign identities on one page.
2. **Tool kits stay tool kits.** Dense workspaces keep the kit of their tool family so Retail/Mists/Forever tools read alike:
   library search and record → `library`; talent workspace → `talents`; tier board → `tier-lists`.
   Forever kit wears the hero buttons and the section-level plaques of those pages. Max two kits per page.
3. **Two new scenes only.** `forever` (old road, gatehouse, far second continent) for hub, dungeons, raids, classes, changes;
   `foreverCrafts` (artisans' hall) for professions. Reuse: library → `archive`; talent calc → `talents` scene
   (`/assets/wow/loading/talents-hall-20261106.webp`, same as Retail calculator); tier lists → `tierLists`.
   The current `wow` Azeroth vista stays Retail's.
4. **Live HTML only.** Every number, name, icon, rank, before/after text is HTML from data. Rasters are decor (`alt=""`,
   `aria-hidden`, `pointer-events:none`). No generated icons, maps, portraits, logos, text.
5. **Material vs glass.** Material plaque = one per block. Inside it: glass rows (`--atlas-surface*`, `--atlas-line-soft`).
   Never plaque-in-plaque, never glass-in-glass, never a painted frame around a plaque. Catalog result lists of thousands
   of rows are glass only (no plaque per row).
6. **Honest data only.** Counts, totals, page numbers come from the imported data. A record type, profession, class or mode
   without verified data is *not rendered* (no tab, no card, no "coming soon"). No scores, win-rates, "%", parse or
   raid statistics on tier lists; no raid tier until a raid is open.
7. **Edition-scoped links.** Every entity link on a Forever page goes to `/[ru/]wow/forever/library/{type}/{id}`
   (DATA contract). Never a Retail library URL, never Wowhead in body text.
8. **Fallback without art.** Until the kit is packed, pages pass `kit="library"` (or the tool kit) — one constant per
   track so the swap is a one-line change (see §8). Nothing waits for generation.

---

## 1. Inventory: what is reused, what is new

| Need | Reuse (exact path) | New |
| --- | --- | --- |
| Frame, hero, sections, stats, grid | `@/components/atlas` → `AtlasFrame` (via `components/wow/forever/ForeverFrame.tsx`), `AtlasHero`, `AtlasSection`, `AtlasStats`, `AtlasGrid` | — |
| Plaque / painted button / icon frame | `components/wow/shared/materialAtlas.ts` → `MaterialPlaque`, `MaterialLinkButton`, `MaterialButton`, `materialIconFrameStyle`, `materialStyles` | kit `forever` added to `components/wow/shared/material/sectionKits.ts` |
| Search box | `components/library/LibrarySearchBox.tsx` (`product` prop) | Forever product value per DATA |
| Record card / row | `components/library/LibraryRecordCard.tsx` (`layout="cards"`), `components/database/CatalogRecordRow.tsx` | — |
| Hover tooltip | `components/library/LibraryHoverPreview.tsx`, `components/database/TooltipContent.tsx` | — |
| Record page | `components/database/EntityDetailPage.tsx` pattern + `RecordSections.tsx` | Forever variant passes edition-scoped links |
| Paging | `AtlasPagination` / `components/library/LibraryPager.tsx` | — |
| Tables | `AtlasTable` (`layout="cards"` for short, `scroll` for long) | — |
| Filters / forms | `AtlasField`, `AtlasInput`, `AtlasSelect`, `AtlasCheckbox`, `AtlasRange`, `AtlasSegmented`, `AtlasTabs` | — |
| States | `AtlasEmpty`, `AtlasError`, `AtlasSkeleton`, `AtlasNotice` | — |
| Folding detail | `AtlasDisclosure` | — |
| Long-page chapters | `AtlasAnchorNav` (classes on `/changes`) | — |
| Class picker / class colour | `components/wow/mists/MistsTalentsPage.tsx` `ClassPicker` pattern + `mists.module.css` `.classPick`; colours `lib/atlas/dataPalette.ts` `classColors` | — |
| Talent calculator shell | `MistsClassTalentsPage` layout (picker → plaque → workspace + detail aside) | 3-tree grid (Forever is a 3-tree, 7-row × 4-col game) |
| Profession icons, difficulty colours | `components/wow/professions/professionKit.ts` (`PROFESSION_ACCENTS`, `DIFFICULTY_STYLE`), `ProfessionParts.tsx` (`ProfessionIcon`, `ProfessionItemLabel`) | — |
| Tier board | `AtlasTierBoard` (lazy) or `components/blocks/wow/tierWorkspace/TierList.tsx` rows | editorial data only |
| Scenes | `lib/atlas/scenes.ts`: `archive`, `talents`-hall art, `tierLists`, `classes` | `forever`, `foreverCrafts` |
| Ornament | `MythicHubOrnaments` (via `materialAtlas.ts`) | `forever-pine` |
| Game icons | `lib/games/wow/assets.ts` + DATA's Forever icon resolver (native icon names from the client data) | — |

New public files (only these): `/assets/wow/slim/forever/controls/{panels/forever.webp, buttons/forever.webp,
frames/forever-icon.webp, ornaments/forever-pine.webp}` + manifests + `SOURCE.md`;
`/assets/wow/loading/forever-old-road-20261111{,-768,-portrait}.webp`, `/assets/wow/loading/forever-crafthall-20261111{,-768,-portrait}.webp`.

---

## 2. Shared shell of every Forever page (coordinator)

```
ForeverFrame(lang, scene)                      ← add a `scene` prop; default "forever"
├─ global top bar (version strip: Forever active) + section row:
│    Dungeons · Raids · Library · Talents · Classes · Professions · Tier lists
│    (only routes that exist and pass QA; "Classes" opens /classes, its page links /changes)
├─ AtlasHero align="start"
│    breadcrumbs: Forever › <Section> [› <Item>]          (11 px label, accent)
│    eyebrow: only real context ("Level 60", "Warrior · Arms", "Item") — never "World of Warcraft"
│    H1 · lede ≤ 2 lines · 1–2 MaterialLinkButton kit="forever" · AtlasStats (real totals, ≤ 4)
├─ ≤ 5 AtlasSection
└─ footer: Forever group gains the same section links; "WoW versions → Retail"; EN/RU keeps path + query + hash
```

- Section accent: Forever pages keep the theme accent for chrome (like M+); kit light `--material-light` (derived from `#9cc0a0`)
  only inside plaques. Do **not** recolour the shell to green.
- Language switch (`ForeverLanguageLinks`) must carry `?type=…&q=…&page=…` and `#tree-…`/`#class-…` — today it carries only the
  dungeon location. Same for the edition switch in the top strip: Retail ↔ Forever lands on the section root, never on a
  Retail record of a Forever id.
- Hero buttons: max two, both `kit="forever"`; on ≤ 600 px full width stacked (`fit="stack"`). Labels ≤ 22 chars so the button
  never wraps (current "Map and strategy" wraps inside 4-column cards — fix by grid `min={320}` and `fit="block"`).

### Breakpoints used below

| Name | Width | Rule |
| --- | --- | --- |
| desktop | 1440 (≥ 1180) | container 1540, two-row header 103 → 47 px sticky |
| tablet | 768 (768–1179) | one-row header 57 px, hero max-width 78 %, scene 768 crop |
| phone | 390 / 320 | portrait scene crop, plaques `padding 28px`, 9-slice ×.14, all buttons full width, ≤ 360 px `padding-inline: 20px` |

No document horizontal scroll at 320/390/768/1024/1440. Wide tables scroll inside their own box with a visible edge fade.

---

## 3. Page anatomy

### 3.1 Hub `/wow/forever` (coordinator)

```
Hero (scene forever): H1 "World of Warcraft: Forever" · lede · [Library] [Talent calculator] · stats: dungeons · raids · classes
§ Tools        5 plaques (forever kit), AtlasGrid min 280 → 3 / 2 / 1 columns:
               icon in forever icon frame 52 · H3 link (the only link) · one line · nothing else
               Library · Talent calculator · Class changes · Professions · Tier lists  (only shipped ones)
§ Raids        existing ForeverRaidCards — kit forever, 3 columns → 1
§ New dungeons existing ForeverDungeonCards — kit forever, min 320 (3 → 2 → 1), button fit="block"
CTA plaque     "Every dungeon" + button → /wow/forever/dungeons, forever-pine ornament from the bottom rail (one per page)
```
Tool icons: native game icons picked from Forever data (a tome item icon, a class-trainer/talent icon, a profession icon…);
never lucide in a painted frame, never generated. Hub copy per tool is one line (§6).

### 3.2 Library landing + paginated catalog `/wow/forever/library?type&q&page` (DATA)

One route, server-rendered list; URL is the only state (works without JS, Back restores).

```
Hero (scene archive): crumbs Forever › Library · H1 "Forever library" · LibrarySearchBox (60 px glass, library kit button)
   stats: real totals per type (Items 23 339 · Spells … ) — only imported types
§ (no title)  type nav: <nav> of links Items · Spells · NPCs · Quests · Recipes with counts, aria-current="page"
              (AtlasTabs look, but links — each type is its own URL; hidden when the type is not imported)
              filter bar (glass row, AtlasField labels above): per type ↓, "Reset" ghost button when any filter is set,
              applied filters as chips with × (each chip a link that removes that one filter)
              result line: "1–48 of 1 284" (only when a filter/query is set; tabular-nums)
              results: LibraryRecordCard layout="cards" grid min 260 (4 / 3 / 2 / 1 col at 1440/1024/768/390)
              AtlasPagination: prev (quiet) · "Page 3 of 27" · next (primary) — 48 per page
```

Filters per type (only fields DATA actually carries):

| Type | Filters | Card facts (≤ 2) |
| --- | --- | --- |
| item | quality (select), slot (select), item level min–max (two numeric inputs), required level | quality colour name, item level · slot |
| spell | class (select of 9 + "General"), rank shown in name | school · cast time, or "Talent" |
| npc | level range, classification (elite/rare/boss) | level · zone |
| quest | level range, zone | level · zone — **only if DATA certifies Forever quests** (quests.json is CMaNGOS baseline → hide the type) |
| recipe | profession (select of 12), skill min–max | profession · required skill |

States: loading — `AtlasSkeleton variant="cards" count={12}`; nothing found — `AtlasEmpty` "Nothing found" + [Reset filters];
API failure — `AtlasError` "The library is not responding. Try again in a minute." + [Try again]; page beyond last → 404-free
redirect to last page. Search under 2 characters: no request, field hint only.

Responsive: filters 4 columns (1440) → 2 (768) → 1 (≤ 600) and collapse into one `AtlasDisclosure` "Filters (2)" on phones,
open when any filter is applied. Pagination on 320: prev/next icons with labels hidden visually but present for AT,
status text stays.

### 3.3 Record `/wow/forever/library/{type}/{id}` (DATA)

```
Hero (scene archiveDeep): crumbs Forever › Library › <Type> · eyebrow "<Type>" · icon 96 in library icon frame
   · H1 in quality colour · one subtitle line (slot · type / school · range) · Share
   aside AtlasMetaList: only player facts (item level, required level, quality, slot | cost, range, cast, cooldown | level, zone)
§ Tooltip            game tooltip (TooltipContent), max-width 420; second column empty → single column
§ Forever change     (spells/talents only, when CLASSES has a verified pair) — the before/after block of §3.6, one entry
§ Related            AtlasDisclosure groups, first two open: Created by · Reagent for · Dropped by · Sold by · Reward from · Teaches
                     each row CatalogRecordRow → Forever record URL; > 20 rows: first 20 + "Show all 134" link to the
                     filtered list (?type=…&related=…), never an unbounded list
```
No ID, build, "complete", JSON, source names on the page. Unknown id → the shared 404.

### 3.4 Talent calculator `/wow/forever/talent-calc[/{class}]` (TALENTS)

Index: hero (scene talents hall, H1 "Talent calculator") + class picker (9 classes, `ClassPicker` pattern: 36 px native class
icon + name in class colour, grid 3 / 3 / 2 / 1). Class page:

```
Hero (compact): crumbs Forever › Talents › <Class> · H1 "<Class> talents" · toolbar: Share
§ (no title)  ClassPicker (current aria-current="page")
              MaterialPlaque kit="talents" (one plaque)
              ├─ summary bar (glass row, sticky under header on desktop):
              │    points left 51 (live)  · required level 60 · "Arms 31 / Fury 20 / Prot 0" · [Reset all] · [Copy link]
              ├─ workspace: three tree columns, each
              │    tree header: native tree icon 32 · tree name H2-size h3 · spent points · reset-tree icon button (44 px)
              │    grid 4 cols × 7 rows; node = button 48 px (desktop) / 44 px (phone), native talent icon,
              │    rank chip "2/5" bottom-right (HTML, tabular, 11 px on --atlas-bg), prerequisite arrows (inline SVG, aria-hidden)
              │    tree background: none (no tree art, no generated textures) — solid glass column
              └─ detail aside (desktop right column 340 px; ≤ 1179 under the trees):
                   icon 44 · name · rank n/m · required tier/prereq · current rank text · next rank text · [−] [+]
```

Layout per width: 1440 — 3 trees + aside (tree column ~300 px, 4 × 48 nodes + 3 × 20 gaps); 1024–1179 — 3 trees, aside below;
768 — `AtlasTabs variant="segmented"` one tree at a time with spent points in each tab; 390/320 — same tabs, nodes 44 px,
gaps 12/8 px (4 × 44 + 3 × 8 = 200 px fits 320 − 2 × 20 padding − plaque rails).

Node states (no colour alone — each has shape/text):

| State | Look |
| --- | --- |
| locked (tier or prereq not met) | icon `grayscale(1)` + 55 % brightness, dashed `--atlas-line` ring, chip hidden, `aria-disabled="true"` (still focusable, detail explains why) |
| available, 0 points | full icon, 1 px `--atlas-line-strong` ring, chip "0/5" |
| partial | `--material-light` 2 px ring, chip "2/5" |
| maxed | `--atlas-caution` 2 px ring, chip "5/5" |
| changed in Forever (toggle "Show Forever changes", off by default) | 8 px corner tick: `--atlas-info` changed / `--atlas-positive` new; legend one line next to the toggle |

Interaction: click/tap/Enter/Space/`+` add a rank; right-click, Shift+click, Backspace/Delete/`−` remove; on touch a tap
*selects* and shows the aside with large [−]/[+] (no long-press magic). Roving tabindex inside each tree; arrows move by
grid cell, Home/End row ends, PageUp/PageDown tree switch. One `aria-live="polite"` region announces "Mortal Strike 1/1 · 9 points left".
Invalid moves never happen silently: the button is `aria-disabled` and the aside names the requirement
("Requires 25 points in Arms", "Requires Deep Wounds 3/3"). Removing a point that would orphan deeper talents is refused with
the same message. URL: versioned build string, `history.replaceState` on change; an unreadable link opens an empty build plus
one `AtlasNotice` "This build link is not valid for Forever. The calculator was reset." — no codes.
Reduced motion: no node pulse, no arrow fill animation. Forced colors: rings → `CanvasText`/`Highlight`, chip
`Canvas`/`CanvasText`, locked state keeps dashed border.

### 3.5 Classes `/wow/forever/classes`, `/wow/forever/classes/{class}` (CLASSES)

Index: hero (scene forever) · § grid of 9 class plaques (forever kit, min 360 → 3 / 2 / 1):
class icon 64 in forever icon frame · H3 name in class colour (link) · three tree names (plain line) ·
two quiet links "Talents" → calc, "Changes · 37" → class page `#changes` (count = verified changes; omit when 0).

Class page:
```
Hero (scene forever): crumbs Forever › Classes › <Class> · H1 <Class> · lede (class role in one sentence, from source text only)
   buttons: [Talent calculator] (forever) · stats: changed · new · removed (only non-zero)
§ Trees          3 glass tiles: tree icon 40 · name · "<n> changed talents" · link → calc #tree-<slug>
§ Changes        the change list of §3.6 filtered to this class (no class filter), grouped by tree then "Baseline abilities"
```

### 3.6 Changes `/wow/forever/changes` (CLASSES) — verifiable before/after

```
Hero (scene forever): H1 "Class changes" · lede · stats: classes 9 · changes N (verified)
§ filter plaque (forever kit, one): AtlasSegmented kind [All · Changed · New · Removed] · class select · search input
   chips for applied filters + Reset · result line "142 changes"
§ list per class: AtlasAnchorNav (9 classes with counts, sticky strip on phones) → one AtlasSection per class (h2 class name,
   class colour only on the name) → glass rows, 30 per class then "Show all 61" (link to ?class=…)
```

Change row (one `<article>`):
```
[icon 40]  Name (link → Forever record)          badge: Talent · Arms  |  Spell     kind badge: Changed / New / Removed
           ┌ Classic 1.15 ──────────────────┐ ┌ Forever ───────────────────────┐
           │ before text (rank shown)        │ │ after text                     │
           └─────────────────────────────────┘ └────────────────────────────────┘
```
- Two equal glass columns ≥ 768, stacked below (Classic first). Column headers are short labels, not dates or builds.
- Differences: only changed tokens wrapped `<del>` (before) / `<ins>` (after), styled `--atlas-accent-wash` background +
  underline (not red/green — "better/worse" is not known). Screen readers get the native del/ins semantics.
- Talents with ranks: show the max rank text by default; `AtlasDisclosure` "All ranks" lists rank lines when both sides have them.
- New: only the Forever column, full width. Removed: only the Classic column, text muted, name not linked if no Forever record.
- Moved talent (tier/row/col/max changed): one fact line under the name, e.g. "Tier 3 → 4 · 5 ranks → 3".
- A change without a verified baseline is not shown as before/after; it may appear as "New" only when the source says so.
- Long text: columns wrap; no truncation; `max-width: var(--atlas-measure)` per column; numbers tabular.

### 3.7 Professions `/wow/forever/professions`, `/wow/forever/professions/{slug}` (GUIDES)

Hub:
```
Hero (scene foreverCrafts): H1 "Professions" · lede · stats: professions 12 · recipes N
§ Crafting   (Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking, Tailoring)
§ Gathering  (Herbalism, Mining, Skinning)
§ Secondary  (Cooking, First Aid, Fishing)
   each: forever plaque min 300 → 3 / 2 / 1; icon 52 in forever icon frame (profession accent halo from PROFESSION_ACCENTS)
   · H3 link · "1–300" skill range (if data) · "48 new recipes" (only if > 0) · nothing else (no profit, no prices)
CTA-less; forever-pine ornament on the last plaque of Crafting only.
```
Profession page:
```
Hero: crumbs Forever › Professions › Alchemy · icon 64 · H1 · stats: recipes · new in Forever · trainers (if data)
§ Recipes    one filter row (glass): search · skill band select (1–75 / 75–150 / 150–225 / 225–300) · source (Trainer · Drop
             · Vendor · Quest · Reputation, only present ones) · [ ] New in Forever
             AtlasTable scroll (desktop/tablet), rows 48 px:
               Recipe (icon 32 + name in quality colour → Forever record; "New" badge) |
               Skill (req number + 4-step difficulty bar orange/yellow/green/grey via DIFFICULTY_STYLE, values from data) |
               Reagents (icons 28 with ×count overlay, each a link, wraps to 2 lines max then "+3") |
               Source (badge + short place/trainer name)
             phones: each row a glass card: name line, skill line with bar, reagents row, source line
             50 rows per page with AtlasPagination, URL keeps filters
§ Trainers   only if data: compact list (name → NPC record, zone)
```
Difficulty bar has text: `aria-label="Orange until 125, yellow 137, green 150, grey 162"` and visible numbers on hover/focus via
`AtlasTooltip`; never colour-only.

### 3.8 Tier lists `/wow/forever/tier-lists` (GUIDES)

Editorial, not statistical.
```
Hero (scene tierLists): H1 "Forever tier lists" · lede (what the ranking is for, one line) · one date "Updated 11 Nov 2026"
§ mode tabs  AtlasTabs segmented: Leveling · Dungeons [· Raids only when a raid is open in Forever] [· PvP only with sources]
§ board      MaterialPlaque kit="tier-lists": tier rows S/A/B/C/D (letter in a fixed 56 px cell, Alegreya),
             entries = spec chip (native spec icon 32, name, class colour stripe) as links to the class page;
             role filter AtlasSegmented (All · Tank · Healer · Damage); on click/focus an entry shows its one-line reason (aside / sheet)
§ (end)      one line: authors/method sentence + a single `<details>` "Sources" if the owner wants citations (§ clean UI)
```
Forbidden: scores, percentages, DPS numbers, parses, "sample size", raid kill data, "Week N", fixture rows.
Phones: tier letter column 40 px, chips wrap 2 per row; letters keep tier colour token from the existing `tierVisuals.tsx`.

### 3.9 Existing dungeons/raids (coordinator)

Swap `kit="den-of-nalorakk"` / `kit="kings-rest"` in `ForeverHome.tsx`, `ForeverInstances.tsx` to the single
`FOREVER_KIT` constant; scene → `forever`. Nothing else changes in their layout.

---

## 4. Interaction and accessibility (all tracks)

- Focus: links/glass `outline: 2px solid var(--atlas-accent-strong); outline-offset: 2px`; painted buttons use the existing
  silhouette `drop-shadow` focus of `material.module.css`; talent nodes `outline: 2px solid var(--material-light)` offset 2.
- Touch: every target ≥ 44 × 44 (chips, × on filter chips, pagination, reagent links get padding, not bigger icons).
  Test with `pointer: coarse` emulation (Valyro Select `::before` incident, design.md §7).
- Keyboard: tabs/segmented — arrows + Home/End (built in); filters submit on change with a real `<form method="get">`
  fallback; talent grid per §3.4; Escape closes sheets/tooltips and returns focus.
- Reduced motion / "Less motion" / reduced transparency / forced colors: copy the four-path template (design.md §5) for
  every new effect; painted layers `display:none` under forced colors with `1px solid CanvasText`.
- Screen readers: one `h1`, sections `h2`, cards `h3`; decor `alt=""`; counts inside link names ("Warrior, 37 changes");
  live region only for calculator points and result counts after filtering.
- Language: `lang` on the page; game names stay English on RU pages (talents, spells, items, zones, bosses) unless DATA
  carries official ruRU names for that record — then use them consistently on the whole page (no mixing).
- Density / long data: tabular-nums everywhere numbers align; no ellipsis on entity names (wrap, `text-wrap: balance` on
  headings, `overflow-wrap: anywhere` on long RU compounds); tables > 6 columns are a design error — move facts into the row;
  lists over 50 → pagination or "Show all N" to a filtered URL, never a 1 000-row DOM; images `loading="lazy"` except hero.
- Performance: list pages are server components; client islands only for search suggestions, calculator, tabs and tier board.

## 5. Clean UI — Forever-specific junk to never ship

"Beta client", "build 1.60.1.70862", "1.15.9", "datamine", "foreverdb", "talentsforever", "Wowhead", "CC-BY" in body text,
"source: …/updated: …" per block, "complete/confirmed", "imported", "normalized", "N records excluded", "Classic baseline",
"Retail fallback", "not verified yet", "coming soon", "beta", record IDs, spell IDs, icon file names, edition slugs.
Attribution required by a licence (CC-BY 4.0 talent export) → **one** line in the page's closing `<details>` "Sources"
(talent calculator and changes pages only), never in the hero or per row.

## 6. Copy (EN / RU, final)

| Key | EN | RU |
| --- | --- | --- |
| nav.library | Library | Библиотека |
| nav.talents | Talents | Таланты |
| nav.classes | Classes | Классы |
| nav.changes | Class changes | Изменения классов |
| nav.professions | Professions | Профессии |
| nav.tiers | Tier lists | Тир-листы |
| hub.library.line | Items, spells, NPCs and recipes of Forever | Предметы, заклинания, NPC и рецепты Forever |
| hub.talents.line | Plan a build for any of the nine classes | Соберите билд любого из девяти классов |
| hub.changes.line | What changed for every class, before and after | Что изменилось у каждого класса — было и стало |
| hub.professions.line | Recipes, reagents and where to learn them | Рецепты, реагенты и где им научиться |
| hub.tiers.line | Strongest specs for leveling and dungeons | Сильнейшие специализации для прокачки и подземелий |
| library.h1 | Forever library | Библиотека Forever |
| library.search | Name in English or Russian | Название на английском или русском |
| library.types | Items · Spells · NPCs · Quests · Recipes | Предметы · Заклинания · NPC · Задания · Рецепты |
| library.range | {from}–{to} of {total} | {from}–{to} из {total} |
| library.empty | Nothing found | Ничего не найдено |
| common.reset | Reset filters | Сбросить фильтры |
| common.retry | Try again | Повторить |
| common.showAll | Show all {n} | Показать все {n} |
| calc.h1 | {Class} talents | Таланты: {Class} |
| calc.left | {n} points left | Осталось очков: {n} |
| calc.level | Required level {n} | Нужен уровень {n} |
| calc.reset | Reset all | Сбросить всё |
| calc.copy | Copy link | Скопировать ссылку |
| calc.requiresPoints | Requires {n} points in {Tree} | Нужно {n} очков в ветке {Tree} |
| calc.requiresTalent | Requires {Talent} {r}/{m} | Нужен талант {Talent} {r}/{m} |
| calc.badLink | This build link is not valid for Forever. The calculator was reset. | Ссылка на билд не подходит для Forever. Калькулятор сброшен. |
| calc.showChanges | Show Forever changes | Показать изменения Forever |
| calc.legend | Changed · New | Изменён · Новый |
| changes.h1 | Class changes | Изменения классов |
| changes.kinds | All · Changed · New · Removed | Все · Изменено · Новое · Удалено |
| changes.before / after | Classic / Forever | Classic / Forever |
| changes.allRanks | All ranks | Все ранги |
| prof.h1 | Professions | Профессии |
| prof.groups | Crafting · Gathering · Secondary | Ремёсла · Сбор · Вторичные |
| prof.new | New in Forever | Новое в Forever |
| prof.cols | Recipe · Skill · Reagents · Source | Рецепт · Навык · Реагенты · Источник |
| tiers.h1 | Forever tier lists | Тир-листы Forever |
| tiers.modes | Leveling · Dungeons | Прокачка · Подземелья |
| tiers.updated | Updated {date} | Обновлено {date} |

Copy lives in each track's `*Copy.ts` (client components get strings as props). No other visible sentences without a reason
a player needs them.

---

## 7. Assets to generate (parent, Codex image_gen, 3 candidates each)

| # | Asset | Display | Used by |
| --- | --- | --- | --- |
| 1 | `forever` panel (9-slice, slim) | 360–1400 px, ×.18 / ×.14 | all Forever section plaques |
| 2 | `forever` button (9-slice) | 68 px tall | hero buttons, CTAs, "Show all", pagination next |
| 3 | `forever-icon` frame | 40–96 px | class 64, profession 52, hub tool 52 |
| 4 | `forever-pine` ornament | ~96 px | hub CTA, professions hub (one per page) |
| 5 | scene `forever` old road | full-bleed hero | hub, dungeons, raids, classes, changes |
| 6 | scene `foreverCrafts` artisans' hall | full-bleed hero | professions |

Prompts verbatim in [CODEX-PROMPTS.md](CODEX-PROMPTS.md). Nothing else is generated: talent-node rings, rank chips, tier letters,
difficulty bars and before/after columns are CSS on tokens.

## 8. Integration recommendations (coordinator)

1. Add `forever` to `SectionKit` + `kits` in `components/wow/shared/material/sectionKits.ts` (accent `#9cc0a0`; frame from the
   new `forever-icon` manifest). Export `FOREVER_KIT = "forever" as const` from `components/wow/forever/foreverKit.ts`;
   until packed, `FOREVER_KIT = "library"` — tracks import the constant, never the literal.
2. `lib/atlas/scenes.ts`: `forever` (`position "70% 38%"`, `horizon "rgba(230, 190, 120, .16)"`, `og [0.7, 0.38]`),
   `foreverCrafts` (`"70% 40%"`, `horizon "rgba(220, 130, 60, .16)"`, `og [0.7, 0.4]`); `npm run art:portraits`; placeholders.
3. `ForeverFrame`: `scene` prop (`forever` | `foreverCrafts` | `archive` | `archiveDeep` | `tierLists` | `classes`) plus an
   `art` passthrough for the talents hall (`/assets/wow/loading/talents-hall-20261106.webp`, it has no scene entry); footer Forever group lists only shipped sections; language links preserve query + hash.
4. Navigation/SEO/sitemap: add routes only after their track passes QA; noindex the calculator share URLs (`?build=`).
5. Gates: `npm run atlas:check`, `npm run design:lock -- --base <candidate>` (shared kit file touched),
   `clean-ui-audit.cjs` on every new route EN/RU, screenshots 1440/768/390/320 EN+RU, `pointer: coarse`, 4 site themes,
   reduced motion, forced colors. Contact sheet of `forever` next to `library`/`talents`/`tier-lists` — must not be brighter.
6. Asset QA failure policy: all 3 candidates FAIL → new round; small defect → edit mode; never retouch. Kit swap is the last
   integration step, so a failed generation never blocks a track.

## 9. Steering per track (paste into the track thread)

**DATA (library):** Build `/[ru/]wow/forever/library` as one server-rendered, URL-driven catalog (type, q, filters, page) on
`LibrarySearchBox` + `LibraryRecordCard layout="cards"` + `AtlasPagination` (48/page), hero scene `archive`, tool kit `library`.
Render only imported types; hide quests unless certified Forever. Record pages follow `EntityDetailPage`: icon 96 in library
frame, quality-coloured H1, player facts only, tooltip, related groups (first 20 + "Show all N" to a filtered list). Every link
Forever-scoped; no IDs/build/source text. States: AtlasSkeleton/Empty/Error with Reset/Retry. Provide a stable icon resolver and
`forever` change pairs to CLASSES. Spec: §3.2–3.3, §4, §5.

**TALENTS (calculator):** Mists calculator shell (ClassPicker → one `MaterialPlaque kit="talents"` → workspace + aside), but
Forever grid: three trees × 7 rows × 4 cols, 48/44 px native icons, HTML rank chips, inline-SVG arrows, sticky summary
(points left, required level, per-tree spend, Reset, Copy link). Tabs per tree ≤ 1179 px. Keyboard/touch/aria per §3.4;
invalid moves explained, never silent; bad URL → reset + one notice. Optional "Show Forever changes" ticks from verified
`classic.status`. Point totals and level rules from data, not constants. No tree background art. Spec: §3.4, §4, §5, §6.

**CLASSES (classes + changes):** 9 class plaques (forever kit via `FOREVER_KIT`, icon 64 in kit frame, class colour on names
only), class page with trees + change list, `/changes` with one filter plaque, AtlasAnchorNav by class, rows with Classic /
Forever columns, `<del>/<ins>` token diff on accent wash, New/Removed single-column, moved-talent fact line, "All ranks"
disclosure. Show before/after only with a verified baseline pair. Links → Forever records / calc `#tree-…`. Spec: §3.5–3.6.

**GUIDES (professions + tier lists):** Professions hub in three groups (forever kit plaques, icon 52 in kit frame, accent
halo from `PROFESSION_ACCENTS`, no prices/profit), scene `foreverCrafts`. Profession page: one filter row + `AtlasTable`
(Recipe · Skill with difficulty bar from real thresholds · Reagents · Source), 50/page, phone cards, "New in Forever" badge
from data. Tier lists: editorial tiers in a `tier-lists` plaque, mode tabs only for modes with real editorial content, no
raid tab until a raid opens, no numbers or scores, one "Updated" date. Spec: §3.7–3.8, §5.
