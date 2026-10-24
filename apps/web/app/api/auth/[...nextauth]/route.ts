import { handlers, isBattleNetAuthConfigured } from "@/auth";
import { publicAuthSessionResponse } from "@/lib/wow/publicAuthSession";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return publicAuthSessionResponse(request, await handlers.POST(request));
}

export async function GET(request: NextRequest) {
  if (!isBattleNetAuthConfigured && new URL(request.url).pathname.endsWith("/session")) {
    return Response.json(null, { headers: { "Cache-Control": "private, no-store" } });
  }
  return publicAuthSessionResponse(request, await handlers.GET(request));
}
