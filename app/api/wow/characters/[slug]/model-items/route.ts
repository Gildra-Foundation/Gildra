import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBattleNetCharacterModelItems, characterSlug } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacters, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.battleNetAccessToken) {
    return NextResponse.json({ error: "session_expired" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const requested = decodeURIComponent((await params).slug).toLowerCase();
  const region = requested.split("--", 1)[0];
  if (!isBattleNetRegion(region)) {
    return NextResponse.json({ error: "character_not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const locale = new URL(request.url).searchParams.get("locale") === "ru" ? "ru" : "en";
    const character = (await getBattleNetCharacters(session.battleNetAccessToken, locale, region))
      .find((entry) => decodeURIComponent(characterSlug(entry)).toLowerCase() === requested);
    if (!character) {
      return NextResponse.json({ error: "character_not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    const modelItems = await getBattleNetCharacterModelItems(session.battleNetAccessToken, character, locale);
    return NextResponse.json({ modelItems }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "model_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
