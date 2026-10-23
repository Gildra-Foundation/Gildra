import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasButton, AtlasLinkButton } from "../src/AtlasButton.tsx";
import { AtlasBadge } from "../src/AtlasBadge.tsx";
import { AtlasNotice } from "../src/AtlasNotice.tsx";
import { Badge } from "../src/valyro-ui/basic/Badge.tsx";
import { Alert } from "../src/valyro-ui/feedback/Alert.tsx";
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

// Valyro classes and data-* hooks in document order: the server-rendered atlas markup must match the vendor's.
const valyroShape = html => [...html.matchAll(/class="([^"]*)"|data-(color|variant|size)="([^"]*)"/g)]
  .map(match => match[1] !== undefined ? match[1].split(" ").filter(name => name.startsWith("ui-")).join(" ") : `${match[2]}=${match[3]}`)
  .filter(Boolean);

test("AtlasBadge renders Valyro Badge's markup on the server", () => {
  const icon = createElement("svg");
  assert.deepEqual(valyroShape(render(AtlasBadge, { tone: "positive", icon, children: "Live" })), valyroShape(render(Badge, { color: "green", icon, children: "Live" })));
  assert.deepEqual(valyroShape(render(AtlasBadge, { children: "Raid" })), valyroShape(render(Badge, { children: "Raid" })));
});

test("AtlasNotice renders Valyro Alert's markup on the server, without a live region", () => {
  const props = { title: "Draft", children: "Sample data", action: createElement("a", { href: "/x" }, "Open") };
  const ours = render(AtlasNotice, { ...props, tone: "caution" });
  const vendor = render(Alert, { title: props.title, description: props.children, action: props.action, variant: "warning", icon: createElement("svg") });
  assert.deepEqual(valyroShape(ours), valyroShape(vendor));
  assert.match(ours, /role="note"/);
  assert.doesNotMatch(render(AtlasNotice, { children: "Info" }), /role=/);
});
