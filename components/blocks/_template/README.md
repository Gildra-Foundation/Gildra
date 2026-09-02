# Block template

Copy this folder to `components/blocks/<game|shared>/<name>/`, rename
`Example*` → your block, then register it in `lib/blocks/registry.ts`.

```
<name>/
  Example.tsx   presentational component (props + data + lang + game → JSX)
  schema.ts     ExampleProps / ExampleData types — JSON-serialisable props only
  data.ts       load(ctx, props): resolve ExampleData through ctx.source
  demo.ts       demo props + data for /dev/blocks
  index.ts      defineBlock({ type, Component, load, anchor?, demo })
```

Rules (see components/blocks/README.md):

- The component renders its own root element; if it is an anchor target it sets
  `id={ANCHORS.x}` and the definition declares `anchor: { id, label }`.
- Links go through `p(lang, href)`; anchors through `anchorHref(ANCHORS.x)`.
- Strings go through `t(lang)` — add RU translations to `lib/i18n.ts`.
- Never import `data/site.ts` or `lib/api/*` from the component; only `demo.ts`
  may import the demo dataset.
