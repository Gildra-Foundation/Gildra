import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import * as tokens from "../../../../packages/atlas-ui/src/motionTokens.ts";
import { routeTurnDeviceAllowed } from "../../components/motion/routeTurnDevice.ts";

const web = new URL("../../", import.meta.url);
const kit = new URL("../../../../packages/atlas-ui/src/", import.meta.url);
const read = (base: URL, path: string) => readFileSync(new URL(path, base), "utf8");

test("scripted motion uses the CSS tempo of the atlas", () => {
  const theme = read(web, "app/styles/atlas-theme.css");
  const token = (name: string) => {
    const value = theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
    assert.ok(value, `--${name} is declared`);
    return value;
  };
  const ms = (value: string) => (value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000);
  assert.equal(token("atlas-ease").replace(/\s+/g, ""), tokens.ATLAS_EASE.replace(/\s+/g, ""));
  assert.equal(ms(token("atlas-duration-fast")), tokens.ATLAS_DURATION_FAST);
  assert.equal(ms(token("atlas-duration")), tokens.ATLAS_DURATION);
  assert.equal(ms(token("atlas-duration-slow")), tokens.ATLAS_DURATION_SLOW);
  assert.equal(ms(token("atlas-duration-art")), tokens.ATLAS_DURATION_ART);
  assert.equal(ms(token("atlas-duration-enter")), tokens.ATLAS_DURATION_ENTER);
  assert.equal(ms(token("atlas-stagger")), tokens.ATLAS_STAGGER);
  assert.equal(ms(token("atlas-duration-sweep")), tokens.ATLAS_DURATION_SWEEP);
  assert.equal(ms(token("atlas-duration-draw")), tokens.ATLAS_DURATION_DRAW);
  assert.equal(ms(token("atlas-duration-pulse")), tokens.ATLAS_DURATION_PULSE);
  assert.equal(ms(token("atlas-duration-spin")), tokens.ATLAS_DURATION_SPIN);
});

test("shared stylesheets take their durations from the motion tokens", () => {
  const files: [URL, string][] = [
    ...readdirSync(new URL("app/styles/", web)).filter((file) => file.endsWith(".css") && file !== "talents.css").map((file): [URL, string] => [web, `app/styles/${file}`]),
    ...readdirSync(kit).filter((file) => file.endsWith(".module.css")).map((file): [URL, string] => [kit, file]),
    ...readdirSync(new URL("components/layout/", web)).filter((file) => file.endsWith(".css")).map((file): [URL, string] => [web, `components/layout/${file}`]),
    [web, "components/atlas/AtlasFrame.module.css"],
    [web, "components/platform/navigation/atlasToolbar.module.css"],
    [web, "components/platform/navigation/bookNavigation.module.css"],
    [web, "components/motion/routeTransition.module.css"],
  ];
  // Choreographed with script (the contents book's lift) or not a motion of the UI (the progress crawl).
  const allowed = [/route-progress 2\.4s/, /backdrop(In|Out) \d+ms/];
  const literal: string[] = [];
  for (const [base, path] of files) {
    const css = read(base, path).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [declaration, , , value] of css.matchAll(/(transition|animation)(-duration|-delay)?\s*:([^;}]*)/g)) {
      const bare = value.replace(/var\([^)]*\)/g, "").replace(/cubic-bezier\([^)]*\)/g, "");
      const times = [...bare.matchAll(/(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b/g)].filter(([, number, unit]) => Number(number) !== 0 && !(number === "1" && unit === "ms"));
      if (times.length && !allowed.some((pattern) => pattern.test(declaration))) literal.push(`${path}: ${declaration.replace(/\s+/g, " ").trim()}`);
    }
  }
  assert.deepEqual(literal, []);
});

test("the page cross-fade skips weak, software-rendering and data-saving devices", () => {
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 8, deviceMemory: 8 }, "gpu"), true);
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 8 }), true, "Safari and Firefox report no memory");
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 4, deviceMemory: 8 }), false);
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 8, deviceMemory: 4 }), false);
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } }), false);
  assert.equal(routeTurnDeviceAllowed({ hardwareConcurrency: 8, deviceMemory: 8 }, "cpu"), false);
});

test("the page hand-over runs on the atlas tempo", () => {
  const css = read(web, "app/styles/route-motion.css");
  assert.match(css, /--atlas-route-duration:\s*var\(--atlas-duration\)/);
  assert.match(read(web, "components/motion/RouteTransitionRuntime.tsx"), /routeTurnDeviceAllowed\(/);
});
