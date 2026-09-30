import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { BattleNetProfileError, getBattleNetCharacters, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";

export const dynamic = "force-dynamic";

const privateNoStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth();
  const accessToken = session?.battleNetAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "session_expired" }, { status: 401, headers: privateNoStore });
  }

  const url = new URL(request.url);
  const regions = Array.from(new Set((url.searchParams.get("regions") ?? "")
    .split(",")
    .filter(isBattleNetRegion)));
  if (!regions.length) {
    return NextResponse.json({ error: "invalid_region" }, { status: 400, headers: privateNoStore });
  }

  const locale = url.searchParams.get("locale") === "ru" ? "ru" : "en";
  const results = await Promise.all(regions.map(async (region) => {
    try {
      const characters = await getBattleNetCharacters(accessToken, locale, region);
      return { region, characters, status: 200 };
    } catch (error) {
      const status = error instanceof BattleNetProfileError ? error.status : 503;
      return { region, characters: [], status };
    }
  }));

  return NextResponse.json({ regions: results }, { headers: privateNoStore });
}
