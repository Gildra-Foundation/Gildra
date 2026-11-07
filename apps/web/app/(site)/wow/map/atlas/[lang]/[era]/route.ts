import { worldMapArtEra, worldMapArtEraIds } from "@/lib/wow/worldMap/data.server";

// One era of the map art (maps placed or drawn differently, that client's points), fetched when the timeline reaches it.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return ["en", "ru"].flatMap((lang) => worldMapArtEraIds().map((era) => ({ lang, era })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string; era: string }> }) {
  const { lang, era } = await params;
  const data = worldMapArtEra(lang === "ru" ? "ru" : "en", era);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
