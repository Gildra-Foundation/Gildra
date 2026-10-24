/** Keep OAuth credentials on the server for every Auth.js session method. */
export async function publicAuthSessionResponse(request: Request, response: Response) {
  if (!new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/session") || !response.ok) return response;
  const session = await response.json();
  const body = session && typeof session === "object" ? {
    expires: session.expires,
    user: session.user && typeof session.user === "object" ? {
      id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image,
    } : undefined,
  } : null;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}
