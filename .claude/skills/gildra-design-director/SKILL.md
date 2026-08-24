---
name: gildra-design-director
description: Workflow for any change that affects how Gildra looks or feels — homepage, routes, components, CSS, responsive UI, artwork, navigation, tier lists, guides, visual QA. Enforces reading the design contract, baseline screenshots, minimal implementation and an evidence-based critique → fix pass.
---

# Gildra Design Director — implementation workflow

Design facts (tokens, patterns, states, anti-patterns) live in the root
[`design.md`](../../../design.md). This skill defines **how to work**, not what
the values are. Do not duplicate the contract here.

## Workflow

1. **Read the contract.** Read root `design.md` in full. If the task touches
   areas where the contract and code disagree, resolve the intent explicitly —
   never silently pick one side (source-of-truth order is defined there, §C).

2. **Understand the flow.** Identify the affected user flow and the existing
   components/patterns that own it. Check `git status`/`git diff` and the
   current render before planning. Reuse existing tokens, components,
   `data/site.ts` and `lib/gameAssets.ts` — no duplicate sources, no invented
   assets or data.

3. **Capture a baseline.** With a local server running:
   `npm run design:capture` (or targeted Playwright MCP captures for specific
   states). Matrix: 1440×1000, 1280×900, 768×1024, 390×844 for `/` and
   `/tier-lists`, plus any interactive states the task touches (menus, search,
   filters, detail panel).

4. **Implement minimally.** Smallest change that fixes the hierarchy/flow
   problem. Respect the hard rules: artwork hero + solid body, honest states,
   one focal point per section, no card-in-card, octagon spec identity.

5. **Verify the render.** `npm run build` must pass (zero TS errors), then
   re-capture the same viewports/states and compare against the baseline.

6. **Critique → fix.** Judge the screenshots, not the code: hierarchy, rhythm,
   backgrounds separation, overflow (390/768/1280/1440 must have zero
   horizontal overflow), crop of artwork, density. Fix regressions and
   re-capture. At least one full critique pass is mandatory.

7. **Accessibility pass.** Keyboard flow for every touched control, visible
   focus, Esc/focus-return on temporary surfaces, `prefers-reduced-motion`,
   AA contrast, truthful disabled/soon states.

8. **Report with evidence.** Screenshots paths, measured heights/overflow,
   check results, and any asset/data gaps left as follow-ups. A green build
   without verified render is not done.

## Boundaries

- Commit/push/deploy only with the user's explicit permission.
- Do not add UI libraries, CSS frameworks or new data sources.
- Do not fix unrelated code inside a design task; log follow-ups instead.
- Known environment quirk: the embedded browser pane may be hidden
  (`document.hidden`), freezing rAF/IO — verify interactions with the headless
  Playwright script or MCP instead.
