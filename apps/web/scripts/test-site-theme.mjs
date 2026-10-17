import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { siteThemeScript, homeThemes } from "../components/platform/home/homeThemes.ts";

function boot(cookie, stored, storageBlocked = false) {
  const root = { dataset: {} };
  runInNewContext(siteThemeScript, {
    document: { cookie, documentElement: root },
    localStorage: { getItem() { if (storageBlocked) throw Error("Blocked"); return stored; } },
  });
  return root.dataset.siteTheme;
}
for (const { id } of homeThemes) {
  assert.equal(boot(`gildra-home-theme=${id}`, null), id);
  assert.equal(boot("", id), id);
  assert.equal(boot(`other=1; gildra-home-theme=${id}; consent=1`, null, true), id);
}
assert.equal(boot("", null), "arthas");
assert.equal(boot("", "untrusted"), "arthas");
assert.equal(boot("gildra-home-theme=illidan", "arthas"), "illidan");
assert.equal(boot("", "varok", true), "arthas");
console.log("Site theme: all preferences, cookie priority, blocked storage and invalid defaults passed.");
