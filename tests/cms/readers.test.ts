import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cmsConfig } from "../../lib/cms/config.ts";
import { plausibleTracker } from "../../lib/cms/plausible.ts";
import { handleReader, type ReaderDeps } from "../../lib/cms/readers.ts";

const ORIGIN = "https://gildra.net";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJlLXBhcnQ";
type Call = { url: string; method: string; headers: Headers; body: unknown };

/** Fake CMS that records every upstream call and answers from a route table. */
function fakeCms(routes: Record<string, (call: Call) => [number, unknown]>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call: Call = { url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const path = new URL(url).pathname;
    const handler = Object.entries(routes).find(([p]) => path === p || path.startsWith(p))?.[1];
    const [status, body] = handler ? handler(call) : [404, { status: "not-found" }];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function deps(f: ReturnType<typeof fakeCms>, secure = true): ReaderDeps {
  return { cmsUrl: "http://cms.internal", site: "gildra", publicOrigin: ORIGIN, secure, cookieBase: "gildra_reader", fetch: f.impl, now: () => 1_800_000_000_000 };
}

function post(action: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`https://gildra.net/api/readers/${action}`, {
    method,
    headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (action: string, cookie?: string) =>
  new Request(`https://gildra.net/api/readers/${action}`, { headers: cookie ? { cookie } : {} });

describe("reader proxy: CSRF and whitelists", () => {
  const f = fakeCms({ "/api/members/register": () => [202, { status: "pending-verification" }] });
  const valid = { email: "a@example.com", password: "long-enough-1", displayName: "A" };

  it("requires the exact site origin on mutations", async () => {
    const attempts: Record<string, string>[] = [{ origin: "https://evil.example" }, { origin: "https://gildra.net.evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }];
    for (const headers of attempts) {
      const res = await handleReader("register", post("register", valid, headers), deps(f));
      assert.equal(res.status, 403, JSON.stringify(headers));
    }
    const noOrigin = new Request("https://gildra.net/api/readers/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) });
    assert.equal((await handleReader("register", noOrigin, deps(f))).status, 403);
    assert.equal(f.calls.length, 0);
  });

  it("rejects non-JSON, unknown fields, wrong types and spoofed site fields", async () => {
    assert.equal((await handleReader("register", post("register", "email=a", { "content-type": "application/x-www-form-urlencoded" }), deps(f))).status, 400);
    for (const body of [{ ...valid, site: "riftden" }, { ...valid, memberships: [] }, { ...valid, password: "short" }, { ...valid, email: 5 }, [valid], "{oops"]) {
      assert.equal((await handleReader("register", post("register", body), deps(f))).status, 400, JSON.stringify(body));
    }
    assert.equal(f.calls.length, 0);
  });

  it("binds the site on the server and forwards only whitelisted fields", async () => {
    const res = await handleReader("register", post("register", valid, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), deps(f));
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: "pending-verification" });
    assert.deepEqual(f.calls[0].body, { site: "gildra", ...valid });
    assert.equal(f.calls[0].url, "http://cms.internal/api/members/register");
    assert.equal(f.calls[0].headers.get("x-forwarded-for"), "203.0.113.9");
  });

  it("refuses unknown actions and wrong methods", async () => {
    assert.equal((await handleReader("admins", get("admins"), deps(f))).status, 404);
    assert.equal((await handleReader("login", get("login"), deps(f))).status, 405);
    assert.equal((await handleReader("session", post("session", {}), deps(f))).status, 405);
  });
});

describe("reader proxy: session cookie", () => {
  const f = fakeCms({
    "/api/members/site-login": (c) => {
      const b = c.body as Record<string, unknown>;
      if (b.password !== "right-password") return [401, { status: "invalid-credentials" }];
      if (b.email === "other@example.com" && b.enroll !== true) return [409, { status: "enrollment-available" }];
      return [200, { status: "ok", token: TOKEN, exp: 1_800_000_000 + 3600, member: { id: 1 }, enrolled: b.enroll === true }];
    },
    "/api/members/session": (c) =>
      c.headers.get("authorization") === `JWT ${TOKEN}`
        ? [200, { authenticated: true, membership: "active", member: { id: 1 }, profile: { handle: "reader", displayName: "Reader", visibility: "public" } }]
        : [401, { authenticated: false }],
    "/api/members/logout": () => [200, {}],
    "/api/member-profiles/9": (c) => [200, { doc: { id: 9, member: 1, ...(c.body as object), handle: "reader", visibility: "public" } }],
    "/api/member-profiles": (c) =>
      c.url.includes("where[handle][equals]=reader") || c.url.includes("where%5Bhandle%5D%5Bequals%5D=reader")
        ? [200, { docs: [{ id: 9, member: 1, handle: "reader", displayName: "Reader", bio: null, visibility: "public" }] }]
        : [200, { docs: [] }],
    "/api/members/availability": () => [200, { site: "gildra", registration: "open", email: "configured" }],
  });

  it("sets an httpOnly, SameSite, Secure __Host- cookie and never returns the token", async () => {
    const res = await handleReader("login", post("login", { email: "a@example.com", password: "right-password" }), deps(f));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes(TOKEN));
    assert.deepEqual(JSON.parse(text), { status: "ok", enrolled: false });
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^__Host-gildra_reader=${TOKEN.replace(/\./g, "\\.")}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure$`));
    assert.equal((f.calls.at(-1)!.body as Record<string, unknown>).site, "gildra");

    const insecure = await handleReader("login", post("login", { email: "a@example.com", password: "right-password" }), deps(f, false));
    assert.match(insecure.headers.get("set-cookie") ?? "", /^gildra_reader=.*HttpOnly; SameSite=Lax; Max-Age=3600$/);
  });

  it("passes failures through as status codes without cookies", async () => {
    const res = await handleReader("login", post("login", { email: "a@example.com", password: "wrong" }), deps(f));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.deepEqual(await res.json(), { status: "invalid-credentials" });
  });

  it("offers enrollment for a network account, then enrolls only with explicit consent", async () => {
    const offer = await handleReader("login", post("login", { email: "other@example.com", password: "right-password" }), deps(f));
    assert.equal(offer.status, 409);
    assert.deepEqual(await offer.json(), { status: "enrollment-available" });
    assert.equal(offer.headers.get("set-cookie"), null);
    const joined = await handleReader("login", post("login", { email: "other@example.com", password: "right-password", enroll: true }), deps(f));
    assert.deepEqual(await joined.json(), { status: "ok", enrolled: true });
    assert.equal((f.calls.at(-1)!.body as Record<string, unknown>).enroll, true);
    assert.equal((await handleReader("login", post("login", { email: "a@example.com", password: "x", enroll: "yes" }), deps(f))).status, 400);
  });

  it("reads the session with the cookie token and clears an invalid cookie", async () => {
    assert.deepEqual(await (await handleReader("session", get("session"), deps(f))).json(), { authenticated: false });
    const ok = await handleReader("session", get("session", `__Host-gildra_reader=${TOKEN}`), deps(f));
    assert.deepEqual(await ok.json(), { authenticated: true, membership: "active", profile: { handle: "reader", displayName: "Reader", visibility: "public" } });
    assert.equal(f.calls.at(-1)!.headers.get("authorization"), `JWT ${TOKEN}`);
    assert.ok(f.calls.at(-1)!.url.endsWith("/api/members/session?site=gildra"));
    const stale = await handleReader("session", get("session", "__Host-gildra_reader=eyJhbGciOiJIUzI1NiJ9.stale-token-value"), deps(f));
    assert.deepEqual(await stale.json(), { authenticated: false });
    assert.match(stale.headers.get("set-cookie") ?? "", /Max-Age=0/);
  });

  it("updates only whitelisted profile fields of the signed-in reader", async () => {
    const cookie = `__Host-gildra_reader=${TOKEN}`;
    const bad = await handleReader("profile", post("profile", { displayName: "X", member: 2 }, { cookie }, "PATCH"), deps(f));
    assert.equal(bad.status, 400);
    assert.equal((await handleReader("profile", post("profile", { handle: "Bad Handle!" }, { cookie }, "PATCH"), deps(f))).status, 400);
    const res = await handleReader("profile", post("profile", { displayName: "New name", bio: "hi" }, { cookie }, "PATCH"), deps(f));
    assert.equal(res.status, 200);
    const patch = f.calls.at(-1)!;
    assert.equal(patch.method, "PATCH");
    assert.ok(patch.url.endsWith("/api/member-profiles/9"));
    assert.deepEqual(patch.body, { displayName: "New name", bio: "hi" });
    const lookup = f.calls.at(-2)!;
    assert.ok(lookup.url.endsWith("/api/member-profiles?where[handle][equals]=reader&limit=1&depth=0"), lookup.url);
    assert.equal(patch.headers.get("authorization"), `JWT ${TOKEN}`);
    assert.equal((await handleReader("profile", post("profile", { displayName: "x" }, {}, "PATCH"), deps(f))).status, 401);
  });

  it("logs out upstream and clears the cookie", async () => {
    const res = await handleReader("logout", post("logout", {}, { cookie: `__Host-gildra_reader=${TOKEN}` }), deps(f));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") ?? "", /^__Host-gildra_reader=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
    assert.ok(f.calls.at(-1)!.url.endsWith("/api/members/logout"));
  });
});

describe("reader proxy: verification, reset and availability", () => {
  const f = fakeCms({
    "/api/members/verify/good-token-123": () => [200, { message: "ok" }],
    "/api/members/verify/": () => [403, { errors: [] }],
    "/api/members/reset-password": (c) => ((c.body as { token: string }).token === "reset-token-1" ? [200, { token: "cms-only" }] : [403, {}]),
    "/api/members/site-forgot-password": () => [503, { status: "unavailable", reason: "email-not-configured" }],
    "/api/members/availability": () => [200, { site: "gildra", registration: "unavailable", email: "not-configured", extra: "dropped" }],
  });

  it("verifies tokens and reports invalid ones", async () => {
    assert.deepEqual(await (await handleReader("verify", post("verify", { token: "good-token-123" }), deps(f))).json(), { status: "verified" });
    const bad = await handleReader("verify", post("verify", { token: "bad-token-123" }), deps(f));
    assert.equal(bad.status, 400);
    assert.equal((await handleReader("verify", post("verify", { token: "../../admins" }), deps(f))).status, 400);
  });

  it("resets passwords without leaking the CMS login token", async () => {
    const res = await handleReader("reset", post("reset", { token: "reset-token-1", password: "a-new-password" }), deps(f));
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(!text.includes("cms-only"));
    assert.equal(res.headers.get("set-cookie"), null);
  });

  it("is honest about missing email delivery and registration availability", async () => {
    const forgot = await handleReader("forgot", post("forgot", { email: "a@example.com" }), deps(f));
    assert.equal(forgot.status, 503);
    assert.deepEqual(await forgot.json(), { status: "unavailable", reason: "email-not-configured" });
    assert.deepEqual(await (await handleReader("availability", get("availability"), deps(f))).json(), { registration: "unavailable", email: "not-configured" });
    assert.ok(f.calls.at(-1)!.url.endsWith("/api/members/availability?site=gildra"));
  });
});

describe("config", () => {
  it("is off without a CMS URL and keeps media origins exact", () => {
    assert.equal(cmsConfig({}).enabled, false);
    assert.equal(cmsConfig({ CMS_INTERNAL_URL: "http://cms:3001", CMS_READERS_ENABLED: "1" }).readersEnabled, true);
    assert.equal(cmsConfig({ CMS_READERS_ENABLED: "1" }).readersEnabled, false);
    const c = cmsConfig({ CMS_INTERNAL_URL: "http://cms:3001/", CMS_PUBLIC_URL: "https://cms.gildra.net/", CMS_MEDIA_ORIGINS: "https://img.example, not a url" });
    assert.deepEqual(c.mediaOrigins, ["https://cms.gildra.net", "https://img.example"]);
    assert.equal(c.site, "gildra");
    assert.equal(cmsConfig({ CMS_INTERNAL_URL: "http://cms:3001", CMS_SITE_SLUG: "../x" }).enabled, false);
  });

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
