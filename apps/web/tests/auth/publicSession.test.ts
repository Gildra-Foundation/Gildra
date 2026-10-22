import assert from "node:assert/strict";
import { test } from "node:test";
import { publicAuthResponse } from "../../lib/auth/publicSession.ts";

const url = "https://example.test/api/auth/session";

test("public session responses omit provider credentials and preserve identity and renewal cookies", async () => {
  const publicFields = { user: { name: "Isolated test" }, expires: "2026-10-23T00:00:00.000Z" };
  const headers = new Headers({ "content-length": "999", "cache-control": "public, max-age=3600" });
  headers.append("set-cookie", "authjs.session-token.0=test-first; Path=/; HttpOnly; SameSite=Lax");
  headers.append("set-cookie", "authjs.session-token.1=test-second; Path=/; HttpOnly; SameSite=Lax");
  const upstream = Response.json({ ...publicFields, battleNetAccessToken: "synthetic-provider-token", battleNetError: "AccessTokenExpired" }, { headers });
  const result = await publicAuthResponse(url, upstream);
  assert.deepEqual(await result.json(), publicFields);
  assert.deepEqual(result.headers.getSetCookie(), upstream.headers.getSetCookie());
  assert.equal(result.headers.get("content-length"), null);
  assert.equal(result.headers.get("cache-control"), "private, no-cache, no-store");
  assert.equal(result.headers.get("pragma"), "no-cache");
  assert.equal(result.headers.get("expires"), "0");
});

test("null sessions remain null and uncacheable, including query and trailing slash URLs", async () => {
  for (const suffix of ["", "?update=1", "/"]) {
    const result = await publicAuthResponse(url + suffix, Response.json(null));
    assert.equal(await result.json(), null);
    assert.equal(result.headers.get("cache-control"), "private, no-cache, no-store");
  }
});

test("OAuth redirects, CSRF and other auth responses pass through unchanged", async () => {
  for (const path of ["signin/battlenet", "callback/battlenet", "csrf", "signout"]) {
    const response = new Response(null, { status: 302, headers: { location: "https://example.test/login" } });
    assert.equal(await publicAuthResponse(`https://example.test/api/auth/${path}`, response), response);
  }
  const failure = Response.json({ error: "MissingCSRF" }, { status: 403 });
  assert.equal(await publicAuthResponse(url, failure), failure);
});

test("a malformed successful session response fails closed", async () => {
  await assert.rejects(publicAuthResponse(url, new Response("invalid session JSON")), SyntaxError);
});
