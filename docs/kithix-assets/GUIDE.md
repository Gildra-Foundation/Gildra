# Kith’ix encounter guide

Reviewed 2026-11-06 UTC. Normal and Heroic only; the selectors do not imply coverage of Mythic, Raid Finder or Story Mode.

## Sources and decisions

- [Wowhead encounter guide and journal](https://www.wowhead.com/guide/midnight/raids/the-unbinding-of-kithix-boss-strategy-abilities-rewards): phase thresholds (100 boss energy, 100 Liadrin energy, 25% health), Normal/Heroic distinctions, six/five lethal Nullify stacks, Last Light, Eightfold Eclipse.
- [Method](https://www.method.gg/guides/the-unbinding-of-kithix/kithix): add separation, assignments, phase-two cooldown use, fragment interception.
- [Icy Veins](https://www.icy-veins.com/wow/kithix-raid-guide): stationary Voidweaver, Hulk frontal, staggered beetle detonations, Heroic eggs. Its opening patch number is inconsistent; not copied.
- [Raidstrats](https://raidstrats.gg/guides/kith-ix/): Heroic mechanics and NPC identifiers (Hulk 268190, Voidweaver 268192). Bloodlust in phase two is the progression recommendation, not a mandatory mechanic.
- [Journal mirror](https://logtar.dev/j/the-unbinding-of-kith-ix/encounters/kith-ix?locale=en): independent mechanic cross-check. Page may render German even with locale=en.

Abyssal Grasp timings differ (8/9 seconds); Negation timings differ (8/12 seconds); Nightfall scaling differs (10/20%). The guide deliberately uses the actionable deadline (heal immediately / touch a gate before expiry) without asserting contested numeric values. Spell and add names use separate RU/EN fields. Russian names were checked against Wowhead’s localized journal (nether.wowhead.com tooltip API, locale=7). No invented spell IDs or map coordinates.

## Implementation

Existing single-boss guide arrangement: compact hero → prep/phase navigation → role briefing beside positioning → selected phase mechanics → enemies → folded sources. Shared AtlasSegmented, MaterialButton, RaidPlaque and VoidspireGuideHint supply the existing interactions. Hash state supports direct links, reload, Back and Forward; malformed values fall back to Normal / damage / swarm.

Existing Kith’ix organic panel, button and loading-screen assets are reused unchanged. Tooltips carry the organic panel and raid accent across portal boundaries. Positioning is a diagram of tactical relationships, never an official map. No generated or edited raster assets.

## Validation

TypeScript, production build, scoped ESLint, atlas:check (143), valyro:check and existing raid tests (11) passed. Chromium checked 108 phase/difficulty/role combinations across EN/RU and 1440/390/320 widths with no page errors or horizontal overflow. Production EN/RU direct-link hydration, controls and touch dialogs passed. Screenshots and full report: /home/debian/gildra-kithix-guide-20261106/REPORT.md. Changes are local and uncommitted; publication requires a separate user request.

## NPC portraits and localization correction

2026-11-06: local original model thumbnails added to enemy cards and hover/focus/touch hints, including Heroic eggs. NPC/display pairs: 268192/147947, 268190/147957, 268194/147952, 268201/122088. Display IDs verified from each Wowhead NPC page (`?power`). Original images: `https://wow.zamimg.com/modelviewer/live/webthumbs/npc/{displayId % 256}/{displayId}.webp`; stored as `/assets/wow/raids/kithix/npc-{npcId}.webp`. No generated substitutes. Russian spell names verified against the localized journal; names, role scenarios, diagrams and hint text follow page locale.

Correction checks: TypeScript, scoped ESLint and atlas:check passed. Chromium rechecked 108 locale/viewport/phase/difficulty/role combinations and 24 portrait dialogs; all four images decode, Escape works, no locale leakage, horizontal overflow or page errors. Widths: 1440, 390, 320.
