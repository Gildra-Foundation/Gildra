import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Auth, type AuthConfig } from "@auth/core";
import { encode } from "@auth/core/jwt";
import { safeBattleProxyResponse, LEGACY_AUTH_PROXY, BATTLE_CALLBACK } from "../../lib/auth/legacyCallback.ts";

const secret = "isolated-auth-proxy-test-secret-not-a-production-credential";
const config: AuthConfig = {
  secret, trustHost: true, basePath: "/api/auth", redirectProxyUrl: LEGACY_AUTH_PROXY,
  logger: { error() {}, warn() {}, debug() {} },
  providers: [{ id: "battlenet", name: "Test provider", type: "oauth", clientId: "test-client", clientSecret: "test-secret", authorization: "https://provider.example/authorize", token: "https://provider.example/token", userinfo: "https://provider.example/userinfo", checks: ["state", "pkce"], profile: () => ({ id: "test" }) }],
};

describe("Auth.js registered legacy redirect proxy", () => {
  it("starts on the new host with old redirect_uri and S256 PKCE", async () => {
    const csrf = await Auth(new Request("https://wowarcana.com/api/auth/csrf"), config);
    const token = (await csrf.json() as { csrfToken: string }).csrfToken;
    const cookie = csrf.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
    const response = await Auth(new Request("https://wowarcana.com/api/auth/signin/battlenet", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: new URLSearchParams({ csrfToken: token, callbackUrl: "https://wowarcana.com/wow/characters" }) }), config);
    const authorize = new URL(response.headers.get("location")!);
    assert.equal(authorize.origin, "https://provider.example");
    assert.equal(authorize.searchParams.get("redirect_uri"), "https://gildra.net/api/auth/callback/battlenet");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorize.searchParams.get("code_challenge"));
    assert.ok(authorize.searchParams.get("state"));
    assert.ok(response.headers.getSetCookie().some(value => value.startsWith("__Secure-authjs.pkce.code_verifier=")));
  });
  it("verifies encrypted state and forwards code/state to the new callback without creating a legacy session", async () => {
    const state = await encode({ secret, token: { origin: `https://wowarcana.com${BATTLE_CALLBACK}`, random: "test-random" }, salt: "encodedState", maxAge: 900 });
    const response = safeBattleProxyResponse(await Auth(new Request(`https://gildra.net${BATTLE_CALLBACK}?code=test-code&state=${encodeURIComponent(state)}`), config));
    const target = new URL(response.headers.get("location")!);
    assert.equal(target.origin, "https://wowarcana.com"); assert.equal(target.pathname, BATTLE_CALLBACK);
    assert.equal(target.searchParams.get("code"), "test-code"); assert.equal(target.searchParams.get("state"), state);
    assert.ok(!response.headers.getSetCookie().some(value => value.startsWith("__Secure-authjs.session-token=")));
  });
  it("rejects forged/expired state and a signed state pointing at another origin", async () => {
    for (const [origin, age, forge] of [[`https://wowarcana.com${BATTLE_CALLBACK}`, 900, true], [`https://wowarcana.com${BATTLE_CALLBACK}`, -900, false], [`https://evil.example${BATTLE_CALLBACK}`, 900, false]] as const) {
      let state = await encode({ secret, token: { origin }, salt: "encodedState", maxAge: age });
      if (forge) state = state.slice(0, 10) + (state[10] === "a" ? "b" : "a") + state.slice(11);
      const response = safeBattleProxyResponse(await Auth(new Request(`https://gildra.net${BATTLE_CALLBACK}?code=test-code&state=${encodeURIComponent(state)}`), config));
      assert.equal(response.headers.get("location"), "https://wowarcana.com/api/auth/error?error=OAuthCallbackError");
    }
  });
});
