import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasButton, AtlasLinkButton } from "../src/AtlasButton.tsx";
import { AtlasInput, AtlasSelect } from "../src/AtlasField.tsx";
import { AtlasValyroSelect } from "../src/AtlasValyroSelect.tsx";
import { AtlasValyroScope } from "../src/AtlasValyroScope.tsx";
import { Button } from "../src/valyro-ui/basic/Button.tsx";
import { mergeProps } from "../src/valyro-ui/primitives/Slot.tsx";

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test("atlas actions use real Valyro markup and preserve native form attributes", () => {
  const html = render(AtlasButton, { children: "Сохранить", type: "submit", name: "intent", value: "save", disabled: true });
  assert.match(html, /class="ui-button /);
  assert.match(html, /type="submit"/);
  assert.match(html, /name="intent"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /ui-button__label">Сохранить/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
});

test("asChild keeps Next navigation as one anchor, including locale path and icon", () => {
  const html = render(AtlasLinkButton, { href: "/ru/wow/articles", children: "Статьи", variant: "primary", iconAfter: createElement("svg", { "aria-hidden": true }) });
  assert.match(html, /^<a /);
  assert.match(html, /href="\/ru\/wow\/articles"/);
  assert.match(html, /data-variant="primary"/);
  assert.match(html, /ui-button__icon/);
  assert.doesNotMatch(html, /<button/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
});

test("external action preserves target and noreferrer", () => {
  const html = render(AtlasLinkButton, { href: "https://example.com", external: true, children: "Open" });
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer"/);
  assert.doesNotMatch(html, /<button/);
});

test("loading action retains its accessible label and busy state", () => {
  const html = render(Button, { loading: true, children: "Save" });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /ui-button__label">Save/);
  assert.doesNotMatch(html, / disabled=/);
});

test("Valyro Slot composes handlers with child cancellation first", () => {
  const calls = [];
  const merged = mergeProps({ onClick: () => calls.push("slot") }, { onClick: event => { calls.push("child"); event.defaultPrevented = true; } });
  merged.onClick({ defaultPrevented: false });
  assert.deepEqual(calls, ["child"]);
});

test("vendored source hashes match recorded provenance", () => {
  const root = new URL("../src/valyro-ui/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("registry-manifest.json", root), "utf8"));
  assert.ok(manifest.components.includes("button"));
  for (const file of manifest.files) {
    const hash = createHash("sha256").update(readFileSync(new URL(file.path, root))).digest("hex");
    assert.equal(hash, file.installedSha256, file.path);
    if (!file.adapted) assert.equal(hash, file.registrySha256, file.path);
  }
});

test("Valyro input retains id, native type, limits, name and default value", () => {
  const html = render(AtlasInput, { id: "rating", name: "rating", type: "number", min: "0", max: "9999", defaultValue: "1234" });
  assert.match(html, /ui-text-input/);
  for (const attr of ['id="rating"', 'name="rating"', 'type="number"', 'min="0"', 'max="9999"', 'value="1234"']) assert.ok(html.includes(attr), attr);
});

test("preference selector renders selected label and form value on the server", () => {
  const html = render(AtlasValyroSelect, { name: "appearance", value: "arthas", options: [{ value: "arthas", label: "Артас" }], "aria-label": "Оформление" });
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-label="Оформление"/);
  assert.match(html, /Артас/);
  assert.match(html, /type="hidden" name="appearance" value="arthas"/);
});

test("existing AtlasSelect keeps the native form select contract", () => {
  const html = render(AtlasSelect, { name: "region", defaultValue: "eu", children: createElement("option", { value: "eu" }, "Europe") });
  assert.match(html, /<select[^>]+name="region"/);
  assert.match(html, /<option[^>]+value="eu"[^>]+selected=""/);
});

test("theme scope renders stable atlas and Valyro attributes without a document mutation", () => {
  const html = render(AtlasValyroScope, { locale: "ru", children: "Content" });
  assert.match(html, /data-atlas-scope="true"/);
  assert.match(html, /data-mode="dark"/);
  assert.match(html, /ui-theme-scope__layers/);
});
