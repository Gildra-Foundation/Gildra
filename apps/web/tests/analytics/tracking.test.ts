import assert from "node:assert/strict";
import { it } from "node:test";
import { isTrackedPage } from "../../lib/analytics/tracking.ts";

it("uses the public site origin independently of a historical Plausible site ID", () => {
  const origin = "https://wowarcana.com";
  assert.equal(isTrackedPage("wowarcana.com", "/ru/wow/map", origin), true);
  assert.equal(isTrackedPage("www.wowarcana.com", "/wow/map", origin), true);
  for (const host of ["localhost", "staging.wowarcana.com", "wowarcana.com.evil.test", "gildra.net"]) {
    assert.equal(isTrackedPage(host, "/", origin), false, host);
  }
  for (const path of [null, "/preview", "/ru/preview/a", "/cms-preview", "/en/cms-preview/a"]) {
    assert.equal(isTrackedPage("wowarcana.com", path, origin), false, String(path));
  }
  assert.equal(isTrackedPage("candidate.test", "/", "https://candidate.test"), true);
});
