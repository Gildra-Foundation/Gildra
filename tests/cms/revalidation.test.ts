import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { createReplayGuard, planInvalidation, verifyRevalidation } from "../../lib/cms/revalidation.ts";
import { planPathInvalidation } from "../../lib/cms/staticPaths.ts";

const SECRET = "test-only-secret";
const NOW = 1_800_000_000;

function signed(body: Record<string, unknown>, opts: { ts?: number; secret?: string } = {}) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(opts.ts ?? NOW);
  const signature = `sha256=${createHmac("sha256", opts.secret ?? SECRET).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  return { rawBody, timestamp, signature };
}

const base = { action: "change", collection: "guides", id: "7", previousSlug: null, site: "gildra", slug: "mythic-plus" };

function verify(req: { rawBody: string; timestamp: string | null; signature: string | null }, replay = createReplayGuard(), secret: string | undefined = SECRET) {
  return verifyRevalidation({ secret, site: "gildra", nowSeconds: NOW, replay, ...req });
}

describe("verifyRevalidation", () => {
  it("accepts a correctly signed request for this site", () => {
    const result = verify(signed(base));
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.body, { ...base });
  });

  it("rejects unauthorized requests", () => {
    assert.deepEqual(verify({ ...signed(base), signature: null }), { ok: false, status: 401, reason: "bad-signature" });
    assert.equal(verify(signed(base, { secret: "other-secret" })).ok, false);
    const tampered = signed(base);
    assert.equal(verify({ ...tampered, rawBody: tampered.rawBody.replace("mythic-plus", "other") }).ok, false);
    assert.equal(verify({ ...signed(base), signature: "sha256=zz" }).ok, false);
    assert.deepEqual(verify(signed(base), createReplayGuard(), ""), { ok: false, status: 503, reason: "not-configured" });
  });

  it("rejects outdated, future and replayed requests", () => {
    assert.equal(verify(signed(base, { ts: NOW - 301 })).ok, false);
    assert.equal(verify(signed(base, { ts: NOW + 301 })).ok, false);
    assert.equal(verify({ ...signed(base), timestamp: null }).ok, false);
    const replay = createReplayGuard();
    const req = signed(base);
    assert.equal(verify(req, replay).ok, true);
    assert.deepEqual(verify(req, replay), { ok: false, status: 409, reason: "replayed" });
  });

  it("rejects a foreign site, unknown vocabulary, bad slugs and oversized bodies", () => {
    assert.deepEqual(verify(signed({ ...base, site: "riftden" })), { ok: false, status: 403, reason: "wrong-site" });
    assert.equal(verify(signed({ ...base, collection: "members" })).ok, false);
    assert.equal(verify(signed({ ...base, collection: "media" })).ok, false);
    assert.equal(verify(signed({ ...base, action: "purge-all" })).ok, false);
    assert.equal(verify(signed({ ...base, slug: "../../etc" })).ok, false);
    assert.equal(verify(signed({ ...base, slug: "a".repeat(400) })).ok, false);
    const big = signed({ ...base, padding: "x".repeat(17 * 1024) });
    assert.deepEqual(verify(big), { ok: false, status: 413, reason: "too-large" });
  });
});

describe("planInvalidation", () => {
  it("uses stale-while-revalidate for edits and immediate expiry for removals", () => {
    assert.deepEqual(planInvalidation({ ...base, action: "change" } as never), [
      { tag: "cms:gildra:articles", mode: "max" },
      { tag: "cms:gildra:article:mythic-plus", mode: "max" },
    ]);
    for (const action of ["unpublish", "delete"]) {
      assert.deepEqual(planInvalidation({ ...base, action } as never), [
        { tag: "cms:gildra:articles", mode: "expire" },
        { tag: "cms:gildra:article:mythic-plus", mode: "expire" },
      ]);
    }
  });

  it("expires a renamed slug immediately and maps other collections", () => {
    assert.deepEqual(planInvalidation({ ...base, previousSlug: "old-slug" } as never), [
      { tag: "cms:gildra:articles", mode: "max" },
      { tag: "cms:gildra:article:mythic-plus", mode: "max" },
      { tag: "cms:gildra:article:old-slug", mode: "expire" },
    ]);
    assert.deepEqual(planInvalidation({ ...base, collection: "pages", slug: "wow/home" } as never), [
      { tag: "cms:gildra:pages", mode: "max" },
      { tag: "cms:gildra:page:wow/home", mode: "max" },
    ]);
    assert.deepEqual(planInvalidation({ ...base, collection: "site-settings", slug: null } as never), [{ tag: "cms:gildra:settings", mode: "max" }]);
    assert.deepEqual(planInvalidation({ ...base, collection: "categories", action: "delete", slug: "raid" } as never), [
      { tag: "cms:gildra:taxonomy", mode: "expire" },
      { tag: "cms:gildra:articles", mode: "expire" },
    ]);
  });
});

describe("planPathInvalidation", () => {
  it("refreshes static block pages that a CMS-less build left without CMS tags", () => {
    assert.deepEqual(planPathInvalidation({ ...base, collection: "pages", slug: "wow/privacy", previousSlug: "wow/tier-lists" } as never), [
      { path: "/privacy" },
      { path: "/ru/privacy" },
      { path: "/tier-lists" },
      { path: "/ru/tier-lists" },
    ]);
    assert.deepEqual(planPathInvalidation({ ...base, collection: "pages", slug: "unknown/page" } as never), []);
    assert.deepEqual(planPathInvalidation({ ...base } as never), []);
    assert.deepEqual(planPathInvalidation({ ...base, collection: "site-settings", slug: null } as never), []);
  });
});
