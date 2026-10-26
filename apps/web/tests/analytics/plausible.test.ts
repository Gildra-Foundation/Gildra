import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { plausibleTracker } from "../../lib/analytics/plausible.ts";

describe("Plausible tracker", () => {
  it("tracks only in production with an https script and a public site id", () => {
    const env = { NODE_ENV: "production", PLAUSIBLE_SCRIPT_URL: "https://stats.example.net/js/script.js", PLAUSIBLE_SITE_DOMAIN: "gildra.net" };
    assert.deepEqual(plausibleTracker(env), { src: "https://stats.example.net/js/script.js", domain: "gildra.net" });
    assert.equal(plausibleTracker({ ...env, NODE_ENV: "test" }), null);
    assert.equal(plausibleTracker({ ...env, NODE_ENV: "development" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_TRACKING: "off" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_SCRIPT_URL: "http://stats.example.net/js/script.js" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_SCRIPT_URL: "javascript:alert(1)" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_SITE_DOMAIN: "" }), null);
    // Optional same-site event endpoint (proxied Plausible); an invalid one disables tracking.
    assert.deepEqual(plausibleTracker({ ...env, PLAUSIBLE_API_URL: "/stats/api/event" }), {
      src: "https://stats.example.net/js/script.js",
      domain: "gildra.net",
      api: "/stats/api/event",
    });
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_API_URL: "https://stats.example.net/api/event" })?.api, "https://stats.example.net/api/event");
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_API_URL: "//evil.example/api/event" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_API_URL: "http://stats.example.net/api/event" }), null);
    assert.equal(plausibleTracker({ ...env, PLAUSIBLE_API_URL: "javascript:alert(1)" }), null);
  });
});
