import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { siteThemeScript } from "../components/platform/home/homeThemes.ts";
for (const saved of [null, "arthas", "illidan", "garek", "varok", "untrusted"]) {
  const root = { dataset: {} };
  runInNewContext(siteThemeScript, { document: { cookie: `gildra-home-theme=${saved}`, documentElement: root }, localStorage: { getItem: () => saved } });
  assert.equal(root.dataset.siteTheme, "arthas");
}
runInNewContext(siteThemeScript, { document: { documentElement: { dataset: {} } } });
console.log("Site theme: Arthas for all legacy preferences, without storage access.");
