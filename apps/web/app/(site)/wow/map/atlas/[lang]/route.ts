import { worldMapBundle } from "@/lib/wow/worldMap/data.server";

// The viewer's data in one language, built with the site; the page links it with a version query.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ lang: "en" }, { lang: "ru" }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang === "ru" ? "ru" : "en";
  return Response.json(worldMapBundle(lang), {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
