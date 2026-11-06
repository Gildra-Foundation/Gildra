import { NextResponse } from "next/server";
import { talentSpellIconUrl } from "@/lib/talentIconMedia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Icon of a talent (?spell=<spell id>) when the CDN refuses its name: redirects to Blizzard's render of the file. */
export async function GET(request: Request) {
  const spellId = Number(new URL(request.url).searchParams.get("spell"));
  if (!Number.isSafeInteger(spellId) || spellId <= 0 || spellId > 1e8) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const url = await talentSpellIconUrl(spellId);
  if (!url) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=1800" } });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=86400" } });
}
