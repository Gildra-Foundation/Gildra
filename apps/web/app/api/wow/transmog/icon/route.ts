import { NextResponse } from "next/server";
import { transmogIconUrl } from "@/lib/wow/transmog/iconMedia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Icon of an item (?item=) or of a set (?set=, its first piece) when the CDN
 * has no file under the icon's name: redirects to Blizzard's render of it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.has("set") ? "set" : "item";
  const id = Number(params.get(kind));
  if (!Number.isSafeInteger(id) || id <= 0 || id > 1e9) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const url = await transmogIconUrl(kind, id);
  if (!url) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=1800" } });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=86400" } });
}
