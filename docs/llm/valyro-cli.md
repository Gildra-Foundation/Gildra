# Valyro CLI and MCP — how Gildra installs Valyro UI

New UI is built from genuine [Valyro](https://valyro.xyz) components, installed as
source through the pinned `valyro-cli` and used through the shared adapters
(`packages/atlas-ui/src/Atlas*.tsx`). Do not hand-write a component Valyro already
has, and do not paste Valyro source by hand.

## Where things live

| Target | `valyro.json` | Sources | Adapters / consumers |
| --- | --- | --- | --- |
| `atlas` (public site) | `packages/atlas-ui/valyro.json` | `packages/atlas-ui/src/valyro-ui/` | `packages/atlas-ui/src/Atlas*.tsx`, `valyroAtlasBridge.module.css`, generated `valyro-public-theme.css` |

The sources folder has a `registry-manifest.json`: the installed components, every
file's registry and installed SHA-256, which files are `adapted`, and why. The CLI
version is pinned in `package.json` scripts, `scripts/valyro.mjs` (`CLI`) and
`.mcp.json`; change all three together.

## Find a component first

- MCP (every Claude Code session in this repo, `.mcp.json` → `valyro`):
  `search_components`, `get_component` (source + docs), `list_categories`,
  `review_composition` (checks a planned set for motion conflicts, missing
  reduced-motion handling, too many accents), `get_docs`.
- Terminal: `npm run valyro -- search tabs`, `npm run valyro -- list --category navigation`.
- Catalogue: https://valyro.xyz. `[Pro]` items need the owner's licence.

Ignore the install command MCP's `get_install_command` returns; use the wrapper below.

## Install or update — always through the wrapper

```sh
npm run valyro:add -- tabs dialog                 # into packages/atlas-ui (default)
npm run valyro:add -- tabs --target all --dry-run # plan only
npm run valyro:drift                              # what changed in the registry since the snapshot (online)
npm run valyro:update -- --dry-run                # plan an update of every recorded component
npm run valyro:check                              # offline: snapshot == manifest, adaptations, public theme
```

`scripts/valyro.mjs` runs `valyro-cli add` in a scratch project, converts the
registry's CRLF endings to LF, and then copies into the target:

- new files are created and recorded;
- pristine files are replaced only in update mode (`valyro:update` or `--update`);
  `add` refuses when the component's dependencies in the snapshot are older than the
  registry, because mixing kit versions breaks imports — update first, review, commit;
- adapted files get their codified adaptation (`ADAPTATIONS` in `scripts/valyro.mjs`)
  re-applied to the new upstream; if an anchor is gone the Gildra file is kept and the
  wrapper prints a `diff -u` against the staged upstream for a manual merge;
- missing npm packages are printed, never installed: add them deliberately
  (`npm install -w @gildra/web …`), they change lockfiles;
- for `atlas` it regenerates `valyro-public-theme.css` (`npm run valyro:generate`).

Never run bare `npx valyro-cli add` in this repo: it writes CRLF files, skips the
manifest and does not re-apply the adaptations.

## Adaptations

Vendor source stays byte-for-byte except recorded adaptations. Prefer an adapter or a
token bridge (`--ui-*` → `--atlas-*` in `valyroAtlasBridge.module.css`) over editing
vendor files. When a vendor edit is unavoidable:

1. keep it minimal and mechanical (selector scope, an optional prop with the original
   default);
2. describe it in the manifest's `adaptations` and set `installedSha256`, `adapted: true`;
3. if it is a literal replacement, add a rule to `ADAPTATIONS` in `scripts/valyro.mjs` so
   updates re-apply it; `scripts/test-valyro.mjs` proves every rule reproduces the
   recorded registry hash.

Current adaptations: theme roots `:root` / `html[data-theme]` → `.gd-valyro` (portals
stay inside the Characters token scope; no ThemeProvider mutates the document theme),
atlas spring and follow easing tokens in `styles/motion.css` scoped to
`.gildra-atlas, [data-atlas-scope]`, and the Pro `AnalyticsFilterBar` `showCompare` /
`showGranularity` flags (manual merge: re-add the two optional props with `true`
defaults).

After an update of `atlas`, `valyro-public-theme.css` must stay a small derivative
(`scripts/test-public-valyro-theme.mjs` fails above 30 % of the theme); a computed
token name with only the bare `--ui-` prefix is ignored by the generator.

## Performance rules

- `@gildra/atlas-ui` is `"sideEffects": ["*.css"]`: `components/atlas` re-exports the
  whole kit, and without the flag every page loaded every component's stylesheet.
  Keep modules of the kit free of top-level side effects.
- Every Valyro component the kit reaches adds its tokens to `valyro-public-theme.css`
  (global CSS). Re-export Valyro parts the app uses directly through
  `packages/atlas-ui/src/valyroParts.ts`, so the generator sees them.
- Heavy or rarely used components load on demand: `notify()` imports the Toaster on
  the first toast; the `/tier-lists` board mounts `AtlasTierBoard` with `next/dynamic`
  when it nears the viewport.
- Tailwind utilities (API console, /analytics) live in a cascade layer and lose to the
  unlayered Valyro CSS. Do not put a Valyro component under markup the console styles
  entirely with utilities; use Valyro where it brings behaviour (focus, keyboard,
  ARIA) and style it through tokens.
- Measure with `npm run budgets -- --base <local prod server>`; prefetched routes make
  single runs vary by tens of KB, so compare repeated runs.

## Pro

Pro sources need the owner's account: the owner runs `npm run valyro:login` (opens
valyro.xyz to approve a one-time code; the token is stored in
`~/.config/valyro/auth.json`). Agents never create, copy or commit tokens; CI uses
`VALYRO_TOKEN`. Without a login the wrapper skips recorded Pro components and refuses
to add new ones; Pro items it installs are listed in the manifest's `proComponents`.

## Environment

The scripts need Node 22 with `npm`/`npx` on `PATH` (CI and the Dockerfiles use
22.23.2). On the shared server `/opt/gildra` is not readable for every user; use a
personal install such as `~/.local/node22` linked into `~/.local/bin`.

On the shared server, run heavy commands (build, typecheck, lint, full tests,
Playwright screenshots) through `/home/zulut/bin/gildra-heavy <command>` — at most two at a
time across all sessions, at low priority — and stop dev servers right after use.
