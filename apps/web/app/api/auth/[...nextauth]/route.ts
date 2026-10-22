import { handlers, isBattleNetAuthConfigured } from "@/auth";
import type { NextRequest } from "next/server";
import { isAuthSessionRequest, publicAuthResponse } from "@/lib/auth/publicSession";

export async function POST(request: NextRequest) {
  return publicAuthResponse(request.url, await handlers.POST(request));
}

export async function GET(request: NextRequest) {
  if (!isBattleNetAuthConfigured && isAuthSessionRequest(request.url)) {
    return publicAuthResponse(request.url, Response.json(null));
  }
  return publicAuthResponse(request.url, await handlers.GET(request));
}
