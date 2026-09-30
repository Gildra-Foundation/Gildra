import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!tokenPattern.test(token)) return NextResponse.json({ code: "share_unavailable" }, { status: 404 });
  const upstreamBase = (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");
  try {
    const response = await fetch(`${upstreamBase}/v1/wow/shared/${token}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const body = await response.text();
    return new NextResponse(body || null, {
      status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ code: "share_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
