import { articleHref } from "@/components/cms/paths";
import { fetchArticles } from "@/lib/cms/client";
import { isCmsEnabled } from "@/lib/cms/config";
import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Published CMS articles; one <url> per language that really exists, with hreflang alternates. */
export async function GET() {
  if (!isCmsEnabled()) return new Response("Not found", { status: 404 });
  const entries: string[] = [];
  for (let page = 1, total = 1; page <= total && page <= 40; page++) {
    const result = await fetchArticles("en", page, 50);
    if (result.status !== "ok") return new Response("CMS unavailable", { status: 503 });
    total = result.data.totalPages;
    for (const a of result.data.docs) {
      const links = a.availableLocales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(siteOrigin + articleHref(l, a.slug))}"/>`)
        .join("");
      for (const l of a.availableLocales) {
        const lastmod = a.updatedAt ? `<lastmod>${xmlEscape(new Date(a.updatedAt).toISOString())}</lastmod>` : "";
        entries.push(`<url><loc>${xmlEscape(siteOrigin + articleHref(l, a.slug))}</loc>${lastmod}${a.availableLocales.length > 1 ? links : ""}</url>`);
      }
    }
  }
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join("")}</urlset>`,
  );
}
