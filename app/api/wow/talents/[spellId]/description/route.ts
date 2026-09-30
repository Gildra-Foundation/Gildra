import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ spellId: string }> };
type WowheadTooltip = { name?: unknown; tooltip?: unknown };

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function toPlainText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDescription(tooltip: string) {
  const descriptions = [...tooltip.matchAll(/<div\s+class=(?:"q"|'q')>([\s\S]*?)<\/div>/gi)];
  return toPlainText(descriptions.at(-1)?.[1] ?? "");
}

export async function GET(request: Request, { params }: RouteContext) {
  const requestedLocale = new URL(request.url).searchParams.get("locale");
  if (requestedLocale !== null && requestedLocale !== "ru" && requestedLocale !== "en") {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const locale = requestedLocale === "en" ? "en" : "ru";
  const spellId = (await params).spellId;
  if (!/^\d{1,9}$/.test(spellId)) {
    return NextResponse.json({ error: "invalid_spell_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch(`https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=${locale === "ru" ? 7 : 0}`, {
      headers: { Accept: "application/json", "User-Agent": "Gildra/1.0 talent-calculator" },
      next: { revalidate: 43_200 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    const payload = await response.json() as WowheadTooltip;
    const tooltip = typeof payload.tooltip === "string" ? payload.tooltip : "";
    const description = extractDescription(tooltip);
    if (!description) {
      return NextResponse.json({ error: "description_not_found" }, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    }
    return NextResponse.json({
      description,
      name: typeof payload.name === "string" ? payload.name : undefined,
      source: "wowhead-tooltip",
      spellId: Number(spellId),
      locale,
    }, { headers: { "Cache-Control": "public, max-age=43200, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ error: "description_source_unavailable" }, { status: 502, headers: { "Cache-Control": "public, max-age=60" } });
  }
}
