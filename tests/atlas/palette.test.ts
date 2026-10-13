import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { atlasSurfaces, atlasTextStrong, classColors, itemQualityColors } from "../../lib/atlas/dataPalette.ts";

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const luminance = (hex: string) => { const [r, g, b] = rgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (a: string, b: string, share: number) => `#${rgb(a).map((value, index) => Math.round(value * share + rgb(b)[index] * (1 - share)).toString(16).padStart(2, "0")).join("")}`;
const worst = (color: string) => Math.min(...Object.values(atlasSurfaces).map((surface) => contrast(color, surface)));

describe("data palette", () => {
  it("surfaces match app/styles/atlas-theme.css", () => {
    const theme = readFileSync(new URL("../../app/styles/atlas-theme.css", import.meta.url), "utf8");
    assert.match(theme, new RegExp(`--atlas-bg: ${atlasSurfaces.bg};`));
    assert.match(theme, new RegExp(`--atlas-surface: ${atlasSurfaces.surface};`));
    assert.match(theme, new RegExp(`--atlas-surface-raised: ${atlasSurfaces.raised};`));
    assert.match(theme, new RegExp(`--atlas-surface-selected: ${atlasSurfaces.selected};`));
    assert.match(theme, new RegExp(`--atlas-text-strong: ${atlasTextStrong};`));
  });
  for (const [quality, color] of Object.entries(itemQualityColors)) {
    it(`item quality ${quality} (${color.name}) text reads at AA on every surface`, () => {
      assert.ok(worst(color.text) >= 4.5, `${color.text}: ${worst(color.text).toFixed(2)}`);
    });
  }
  for (const [name, color] of Object.entries(classColors)) {
    it(`class ${name}: the name colour (62 % class + text) reads at AA`, () => {
      const text = mix(color, atlasTextStrong, 0.62);
      assert.ok(worst(text) >= 4.5, `${name} ${text}: ${worst(text).toFixed(2)}`);
    });
  }
});
