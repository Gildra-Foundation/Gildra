/** Provider credentials are server-only, including Auth.js session updates. */
export const isAuthSessionRequest = (url: string): boolean =>
  new URL(url).pathname.replace(/\/+$/, "").endsWith("/session");

export async function publicAuthResponse(url: string, response: Response): Promise<Response> {
  if (!isAuthSessionRequest(url) || !response.ok) return response;

  const session: unknown = await response.clone().json();
  if (session && typeof session === "object") {
    delete (session as Record<string, unknown>).battleNetAccessToken;
    delete (session as Record<string, unknown>).battleNetError;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-cache, no-store");
  headers.set("expires", "0");
  headers.set("pragma", "no-cache");
  return new Response(JSON.stringify(session), { status: response.status, headers });
}
