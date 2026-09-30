import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const api = process.env.API_INTERNAL_URL ?? "http://api:8080";
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
