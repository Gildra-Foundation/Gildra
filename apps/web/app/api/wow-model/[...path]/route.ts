import { NextRequest, NextResponse } from "next/server";

const MODEL_ORIGIN = "https://wow.zamimg.com/modelviewer/live/";
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!path || path.includes("..") || !SAFE_PATH.test(path)) {
    return NextResponse.json({ message: "Invalid model asset path" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(new URL(path, MODEL_ORIGIN), {
      headers: { "User-Agent": "Gildra character model viewer" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json(
      { message: "Model asset service is temporarily unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { message: "Model asset was not found" },
      { status: upstream.status, headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
  headers.set("Cache-Control", path.startsWith("meta/")
    ? "public, max-age=86400, stale-while-revalidate=604800"
    : "public, max-age=604800, stale-while-revalidate=2592000");
  headers.set("X-Content-Type-Options", "nosniff");
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);
  return new NextResponse(upstream.body, { status: 200, headers });
}
