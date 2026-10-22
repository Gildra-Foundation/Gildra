import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { defaultSource, generatePublicMotion, generatePublicTheme } from "./generate-public-valyro-theme.mjs";
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const postcss = createRequire(requireWeb.resolve("next/package.json"))("postcss");

function declarations(css) {
  const result = [];
  postcss.parse(css).walkDecls(decl => {
    const context = [];
    for (let parent = decl.parent; parent?.type !== "root"; parent = parent.parent) {
      context.unshift(parent.type === "atrule" ? `@${parent.name} ${parent.params}` : parent.selector);
    }
    result.push({ context, prop: decl.prop, value: decl.value, important: Boolean(decl.important) });
  });
  return result;
}

test("public derivative preserves every needed source value, selector, media condition and cascade order", () => {
  const result = generatePublicTheme();
  const original = fs.readFileSync(result.theme, "utf8");
  const generated = fs.readFileSync(result.output, "utf8");
  assert.equal(generated, result.css, "Regenerate after changing public imports or token usage");
  const all = declarations(original);
  const expected = all.filter(decl => !decl.prop.startsWith("--ui-") || result.needed.has(decl.prop));
  assert.deepEqual(declarations(generated), expected);
  assert.ok(expected.some(decl => decl.context.some(context => context.includes("dark"))), "dark theme preserved");
  assert.ok(expected.some(decl => decl.context.some(context => context.includes("prefers-reduced-motion"))), "reduced motion preserved");
  assert.ok(expected.some(decl => decl.context.some(context => context.includes("prefers-contrast"))), "contrast fallback preserved");
  assert.ok(Buffer.byteLength(generated) < Buffer.byteLength(original) * .3, "public bundle must not regress to the entire theme");
  const scope = fs.readFileSync(path.join(defaultSource, "AtlasValyroScope.tsx"), "utf8");
  assert.match(scope, /import "\.\/valyro-public-theme\.css"/u);
  assert.doesNotMatch(scope, /import "\.\/valyro-ui\/styles\/themes\/vercel\.css"/u);
});

test("new nested imports, re-exports, CSS imports, computed tokens and chained values are discovered without a component allowlist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "valyro-theme-contract-"));
  try {
    const put = (file, content) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); };
    put("Adapter.tsx", 'export { Component } from "./valyro-ui/widget/index";');
    put("valyro-ui/widget/index.ts", 'export { Component } from "./Component";');
    put("valyro-ui/widget/Component.tsx", 'import "./component.css"; export const Component = () => null; const token = `--ui-tone-${state}`;');
    put("valyro-ui/widget/component.css", '@import "./nested.css"; .widget { color: var(--ui-used); }');
    put("valyro-ui/widget/nested.css", '.widget:hover { background: var(--ui-nested); }');
    put("valyro-ui/styles/themes/vercel.css", `
      [data-theme=vercel] { --ui-used: var(--ui-parent, red); --ui-parent: var(--ui-base); --ui-base: blue; --ui-nested: black; --ui-tone-good: green; --ui-tone-bad: red; --ui-unused: orange; color-scheme: light; }
      [data-theme=vercel][data-mode=dark] { --ui-base: white; --ui-unused: pink; color-scheme: dark; }
      @media (prefers-contrast: more) { [data-theme=vercel] { --ui-parent: yellow; } }
    `);
    const generated = generatePublicTheme(root);
    const props = new Set(declarations(generated.css).map(decl => decl.prop));
    for (const name of ["--ui-used", "--ui-parent", "--ui-base", "--ui-nested", "--ui-tone-good", "--ui-tone-bad"]) assert.ok(props.has(name), name);
    assert.ok(!props.has("--ui-unused"));
    assert.deepEqual(declarations(generated.css).filter(decl => decl.prop === "--ui-base").map(decl => decl.value), ["blue", "white"]);
    assert.ok(generated.files.some(file => file.endsWith("nested.css")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("public motion keeps springs and the reduce switch, and drops kit features no public code sets", () => {
  const result = generatePublicMotion();
  assert.equal(fs.readFileSync(result.output, "utf8"), result.css, "Regenerate after changing public imports");
  for (const token of ["--ui-spring-smooth", "--ui-spring-snappy", "--ui-spring-bouncy", "--ui-ease-follow"]) assert.match(result.css, new RegExp(token), token);
  assert.match(result.css, /\[data-ui-motion='reduce'\]/u);
  assert.match(result.css, /\.gildra-atlas,\n\[data-atlas-scope\]/u, "springs stay in the atlas scope");
  const scope = fs.readFileSync(path.join(defaultSource, "AtlasValyroScope.tsx"), "utf8");
  assert.match(scope, /import "\.\/valyro-public-motion\.css"/u);
  assert.doesNotMatch(scope, /valyro-ui\/styles\/motion\.css/u);
});

test("public motion follows the data-ui attributes the code sets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "valyro-motion-contract-"));
  try {
    const put = (file, content) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); };
    put("Adapter.tsx", 'import { Fold } from "./valyro-ui/widget/Fold"; export const A = () => <Fold />;');
    put("valyro-ui/widget/Fold.tsx", '// data-ui-enter is only mentioned here\nexport const Fold = () => <div data-ui-fold="spring" />;');
    put("valyro-ui/styles/themes/vercel.css", "[data-theme=vercel] { --ui-a: 1; }");
    put("valyro-ui/styles/motion.css", `
      :root { --ui-spring: linear(0, 1); }
      @media (prefers-reduced-motion: no-preference) { [data-ui-enter] { animation: ui-enter 1s; } }
      [data-ui-fold], [data-ui-intro] { animation: ui-fold 1s; }
      @keyframes ui-enter { from { opacity: 0; } }
      @keyframes ui-fold { from { height: 0; } }
      @property --ui-view-progress { syntax: "<number>"; inherits: false; initial-value: 0; }
    `);
    const { css } = generatePublicMotion(root);
    assert.match(css, /--ui-spring/u);
    assert.match(css, /\[data-ui-fold\] \{/u);
    assert.doesNotMatch(css, /data-ui-enter|data-ui-intro|@media|ui-enter|--ui-view-progress/u);
    assert.match(css, /@keyframes ui-fold/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
