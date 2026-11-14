import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BATTLE_CALLBACK, LOGS_CALLBACK, LEGACY_AUTH_PROXY, isLegacyCallback, legacyBattleRequest, legacyLogsTarget, safeBattleProxyResponse } from "../../lib/auth/legacyCallback.ts";
const request = (path: string, host = "gildra.net") => new Request(`https://${host}${path}`, { headers: { host } });

describe("legacy OAuth callbacks", () => {
  it("enables only the exact registered host, path and proxy", () => {
    assert.ok(isLegacyCallback(request(BATTLE_CALLBACK), BATTLE_CALLBACK, LEGACY_AUTH_PROXY));
    for (const host of ["wowarcana.com", "www.gildra.net", "gildra.net.evil.test"]) assert.equal(isLegacyCallback(request(BATTLE_CALLBACK, host), BATTLE_CALLBACK, LEGACY_AUTH_PROXY), false);
    assert.equal(isLegacyCallback(request("/api/auth/signin"), BATTLE_CALLBACK, LEGACY_AUTH_PROXY), false);
    assert.equal(isLegacyCallback(request(BATTLE_CALLBACK), BATTLE_CALLBACK, "https://evil.test/api/auth"), false);
  });
  it("reconstructs the old origin for Auth.js without changing OAuth code/state", () => {
    const source = new Request(`https://wowarcana.com${BATTLE_CALLBACK}?code=abc&state=def`, { headers: { host: "gildra.net" } });
    const target = legacyBattleRequest(source);
    assert.equal(target.url, `https://gildra.net${BATTLE_CALLBACK}?code=abc&state=def`);
    assert.equal(target.headers.get("host"), "gildra.net");
  });
  it("WCL forwards to a fixed new-host callback and copies only OAuth fields", () => {
    const target = legacyLogsTarget(request(`${LOGS_CALLBACK}?code=x&state=y&error=denied&redirect_uri=https://evil.test&next=//evil.test`), LEGACY_AUTH_PROXY);
    assert.equal(target?.href, `https://wowarcana.com${LOGS_CALLBACK}?code=x&state=y&error=denied`);
    assert.equal(legacyLogsTarget(request(LOGS_CALLBACK, "wowarcana.com"), LEGACY_AUTH_PROXY), null);
  });
  it("permits only the new Battle.net callback, even if upstream state names another signed destination", () => {
    const success = safeBattleProxyResponse(Response.redirect(`https://wowarcana.com${BATTLE_CALLBACK}?code=x&state=y`));
    assert.equal(success.headers.get("location"), `https://wowarcana.com${BATTLE_CALLBACK}?code=x&state=y`);
    assert.equal(success.headers.get("cache-control"), "private, no-store");
    assert.equal(success.headers.get("referrer-policy"), "no-referrer");
    assert.equal(success.headers.get("x-robots-tag"), "noindex, nofollow");
    for (const destination of ["https://evil.test/api/auth/callback/battlenet", "https://wowarcana.com/other", "https://wowarcana.com.evil.test/api/auth/callback/battlenet"]) {
      assert.equal(safeBattleProxyResponse(Response.redirect(destination)).headers.get("location"), "https://wowarcana.com/api/auth/error?error=OAuthCallbackError");
    }
  });
});
