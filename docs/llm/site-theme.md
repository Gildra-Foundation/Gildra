# Site theme and page transitions

Owner direction, 17 October 2026: the character selected on the homepage sets the
site theme, including page transitions. This replaces the earlier requirement
for a fixed amber accent on all inner pages. Page structure, data colours,
typography and the contents book remain as described in `atlas-theme.md`.

`SiteTheme` is mounted in `app/root-document.tsx`, above the navigator and route
shell. The existing `gildra-home-theme` cookie/storage key is retained. A head
script applies the saved theme before paint on direct visits and language
reloads. Cookies take priority over localStorage, matching the homepage server's
art preload. The provider synchronizes other tabs and supports blocked storage.
`HomeTheme` adapts the server's initial art/quote to the shared preference without
owning a second selection state.

`app/styles/site-theme.css` maps the character palette to atlas tokens in every
`.gildra-atlas` and `[data-atlas-scope]`, including portalled toolbars/dialogs.
Arthas uses frost blue; Illidan, Garek and Varok follow the homepage's violet,
green and coral palettes. Fel particles and transition light retain their green.
Class, role, item-quality and status colours are unchanged.

`ThemedPageTransition` captures an inert copy of visible outgoing route content,
the shared toolbar and any open contents dialog. Offscreen subtrees are pruned;
scripts/media are omitted, canvases are copied when permitted, input values are
cleared, and IDs/SVG references are namespaced per fragment. No snapshot, canvas loop or animation is
kept while idle. No screenshot service or external animation dependency is used.

- Arthas: 340 ms of frost, 220 ms of growing cracks, then 12 clipped fragments
  disperse over the loaded destination in 620 ms. A short synthesized ice crack
  follows the existing explicit scene-sound choice and volume; it is silent by
  default and releases its AudioContext afterwards.
- Illidan: a diagonal fel rift.
- Garek: a circle of light.
- Varok: rising embers and a burning edge.

Routing starts immediately beneath the effect. The old screen stays frozen if
the destination is still loading. Escape, resize, unmount and the 12-second
watchdog clear the fragments, timers and audio. Reduced motion (OS or the site's
choice) skips snapshots, shattering and sound. A new navigation replaces the
previous effect. Existing path identity excludes filters, anchors, language-only
changes, hub aliases, downloads and external/new-tab links. Explicit
`data-no-book-transition` is respected on capture and on route commit.
Programmatic navigations without a captured source get an arrival effect.
Phase clocks start after capture. The crack phase receives a rendered frame and
220 ms before fragments can leave, including instant cached navigations. The
transition host stays transparent despite legacy shell background rules, so gaps
between fragments expose the actual destination.

## Verification

From `apps/web`:

```sh
node scripts/test-site-theme.mjs
node scripts/test-route-transition-policy.mjs
node scripts/check-atlas-tokens.mjs
node scripts/qa-site-theme.mjs --serve
```

Browser QA uses the installed Playwright and its Chromium. Set `CHROMIUM_PATH`
when using an existing browser executable; omit `--serve` and set `BASE_URL` to
test a running preview. Add `--production` after `--serve` to use an existing
production build instead of the development server. Evidence is saved under
`.artifacts/site-theme/`.
The journey covers all four selections, scene/chrome/effect persistence,
reloads, history, opt-out, filters/anchors, RU/EN, 320–1440 px, delayed navigation,
Escape, cross-tab synchronization and system/site reduced motion. It also
checks minimum crack duration, transparent fragment gaps, default silence and
AudioContext cleanup when sound is enabled.

## Local delivery boundary

Worktree: `/home/debian/Gildra-theme-transitions-20261017`, branch
`feature/site-theme-transitions-20261017`, based on locally available
`origin/master` (`358a14e`). No commit, push or deployment was requested.
The shared coordination state was readable and had no active claims, but was
read-only in this sandbox. Isolated development was registered in
`/home/debian/gildra-theme-work-state`; production and shared data were untouched.

## Delivery evidence (17 October 2026)

- Full Next.js 16.3.8 production build passed, including TypeScript and all
  766 prerendered pages. The final transparent overlay is included.
- `test-site-theme.mjs`, the existing route-policy suite, atlas token checks,
  scoped ESLint and `git diff --check` passed.
- Chromium production QA passed for all four themes and all listed navigation,
  language, viewport, delay, cancellation, cross-tab, sound and motion scenarios.
  After the last CSS background fix, the complete browser journey passed again
  in a fresh local preview, including the transparent-gap regression assertion.
- The saved `arthas-shattering.png` was visually inspected: the outgoing frozen
  homepage breaks into fragments, exposing the destination page between them.
- React Doctor checked the changed code and the three new modules. Its score
  service was unreachable. Two advisory warnings were reviewed and accepted:
  theme context values are rebuilt on infrequent preference updates; snapshot
  style writes target detached clones and cannot cause live-page layout thrash.
- Local checks used the already installed Node 24.21.0 runtime at
  `/tmp/gildra-audit-python/playwright/driver/node`, since the system Node symlink
  points to an inaccessible directory in this sandbox. No dependencies were
  installed or changed. Build-generated agent files and type-config edits were
  removed/restored; they are not part of the feature.

No commit, push, production deployment, database change or service restart was
performed. Review the isolated working-tree diff before publication.
