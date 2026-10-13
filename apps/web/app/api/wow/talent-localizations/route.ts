import { NextResponse } from "next/server";
import { getLocalizedTalentSpells } from "@/lib/wow/localizedTalentSpells";

export const dynamic = "force-dynamic";

const cacheControl = "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const lang = search.get("lang");
  const rawIds = search.get("ids")?.split(",") ?? [];
  if ((lang !== "ru" && lang !== "en") || rawIds.length === 0 || rawIds.length > 180) {
    return NextResponse.json({ error: "invalid_talent_localization_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const ids = [...new Set(rawIds.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return NextResponse.json({ error: "invalid_talent_spell_ids" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const translations = await getLocalizedTalentSpells(ids, lang, 8_000);
  return NextResponse.json(
    { translations: Object.fromEntries(translations) },
    { headers: { "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" } },
  );
}
