import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { apiInternalUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const api = apiInternalUrl();
  const cookie = (await headers()).get("cookie") ?? "";

  try {
    const response = await fetch(`${api}/v1/auth/me`, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return NextResponse.json({ user: null });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ user: null });
  }
}
