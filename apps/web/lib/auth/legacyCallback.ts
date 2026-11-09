import { SITE_ORIGIN } from "@/lib/seo/site";

export const LEGACY_AUTH_ORIGIN = "https://gildra.net";
export const LEGACY_AUTH_PROXY = `${LEGACY_AUTH_ORIGIN}/api/auth`;
export const BATTLE_CALLBACK = "/api/auth/callback/battlenet";
export const LOGS_CALLBACK = "/api/wow/logs/callback";

/** Only the two registered old-host callbacks bypass the domain redirect. */
export function isLegacyCallback(request: Request, path: string, proxy = process.env.AUTH_REDIRECT_PROXY_URL) {
  return proxy === LEGACY_AUTH_PROXY && request.headers.get("host")?.toLowerCase() === "gildra.net" && new URL(request.url).pathname === path;
}

/** Preserve the old public origin for Auth.js's built-in, encrypted-state redirect proxy. */
export function legacyBattleRequest(request: Request) {
  const url = new URL(request.url);
  return new Request(`${LEGACY_AUTH_ORIGIN}${BATTLE_CALLBACK}${url.search}`, request);
}

/** WCL's code is still redeemed with the old redirect_uri, after new-host state + PKCE validation. */
export function legacyLogsTarget(request: Request, proxy = process.env.AUTH_REDIRECT_PROXY_URL) {
  if (!isLegacyCallback(request, LOGS_CALLBACK, proxy)) return null;
  const target = new URL(LOGS_CALLBACK, SITE_ORIGIN);
  const source = new URL(request.url);
  for (const key of ["code", "state", "error"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return target;
}

export function protectedCallback(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Even correctly signed Auth.js state may only forward to this site's callback. */
export function safeBattleProxyResponse(response: Response) {
  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, LEGACY_AUTH_ORIGIN);
    if (target.origin !== SITE_ORIGIN || target.pathname !== BATTLE_CALLBACK) {
      return protectedCallback(Response.redirect(`${SITE_ORIGIN}/api/auth/error?error=OAuthCallbackError`, 302));
    }
  }
  return protectedCallback(response);
}
