import { NextRequest, NextResponse } from "next/server";
import { apiInternalUrl } from "@/lib/env";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ message: "Payload too large" }, { status: 413 });
  }
  const apiURL = apiInternalUrl();
  const response = await fetch(`${apiURL}/v1/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
