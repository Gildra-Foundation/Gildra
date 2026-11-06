import { NextResponse } from "next/server";
import { loadPlayerModelItems } from "@/lib/wow/playerProfile";
import { parsePlayerKey } from "@/lib/wow/playerProfileView";

type RouteContext = { params: Promise<{ region: string; realm: string; name: string }> };

/** Equipment display ids for the 3D model of a public profile (GET, cached a day on the server). */
export async function GET(_request: Request, { params }: RouteContext) {
  const key = parsePlayerKey(await params);
  if (!key) return NextResponse.json({ error: "character_not_found" }, { status: 404 });
  try {
    const modelItems = await loadPlayerModelItems(key.region, key.realm, key.name);
    return NextResponse.json({ modelItems }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "model_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
