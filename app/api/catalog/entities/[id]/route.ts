import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rawID = (await context.params).id;
  const id = decodeURIComponent(rawID ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: "Invalid catalog entity ID" }, { status: 400 });
  }
  const locale = request.nextUrl.searchParams.get("locale") === "ru_RU" ? "ru_RU" : "en_US";
  const apiURL = process.env.API_INTERNAL_URL ?? "http://api:8080";
  const session = request.cookies.get("gildra_admin_session")?.value;
  const headers = session ? { Cookie: `gildra_admin_session=${encodeURIComponent(session)}` } : undefined;
  const response = await fetch(`${apiURL}/v1/game/entities/${id}?locale=${locale}`, {
    // Catalog access is private in production. Do not cache an authenticated
    // response in the Next data cache or a shared CDN, and forward only the
    // session cookie required by the Go API.
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
