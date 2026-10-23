# Valyro source snapshot

Actual Valyro components and motion primitives, first taken from Gildra's CMS
registry snapshot of 18 October 2026. See `registry-manifest.json` for registry
provenance, original/installed SHA-256 values and adaptations. Add and update
files only with `npm run valyro:add` / `npm run valyro:update` (configuration in
`../../valyro.json`; see `docs/llm/valyro-cli.md`).
This package uses source modules directly; there is no registry connection or
credential requirement at runtime. The stored Pro analytics component is not
imported by the public site.

The Atlas adapters use Button/Slot, TextInput, Tooltip, Select and shared motion
primitives while keeping the site's public component contracts. Valyro theme
scope keeps portaled layers in the Characters token scope; the separate
`valyroAtlasBridge.module.css` maps `--ui-*` to `--atlas-*`. No ThemeProvider
mutates the document's existing theme attributes. Native AtlasSelect stays
available for plain forms and existing select-event handlers.

`motion-kit/` (`page-transition`, added with `npm run valyro:add`) serves the
route veil through `src/motionTier.ts`: its render-tier detection gives GPU
machines the full sweep and CPU-composited ones a one-layer dissolve. The
`PageTransition` component itself is not mounted — it keeps the leaving page
rendered under a key, while the App Router shell never remounts page content.

Run adapter SSR/provenance tests from the repository root:

```sh
node --import ./packages/atlas-ui/tests/valyro-loader.mjs --test packages/atlas-ui/tests/valyro.test.mjs
```
