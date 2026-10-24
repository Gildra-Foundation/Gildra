import { NextResponse } from "next/server";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { getTalentSpecThemeById } from "@/lib/talentSpecThemes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const spec = getTalentSpecThemeById(Number(params.get("spec"))), lang = params.get("lang"), hero = Number(params.get("hero"));
  if (!spec || (lang !== "ru" && lang !== "en") || !spec.heroPaths.some(path => path.id === hero) || [...params.keys()].some(key => !["spec", "hero", "lang"].includes(key))) return NextResponse.json({ error: "invalid_tree_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const data = await getMidnightTalentData(spec.slug, hero, lang);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "tree_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
