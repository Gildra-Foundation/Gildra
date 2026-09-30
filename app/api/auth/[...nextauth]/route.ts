import { handlers, isBattleNetAuthConfigured } from "@/auth";
import type { NextRequest } from "next/server";

export const POST = handlers.POST;

export async function GET(request: NextRequest) {
  if (!isBattleNetAuthConfigured && new URL(request.url).pathname.endsWith("/session")) {
    return Response.json(null);
  }
  const response = await handlers.GET(request);
  if (!new URL(request.url).pathname.endsWith("/session") || !response.ok) return response;

  const session = await response.clone().json();
  if (session && typeof session === "object") {
    delete session.battleNetAccessToken;
    delete session.battleNetError;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(session), {
    status: response.status,
    headers,
  });
}
