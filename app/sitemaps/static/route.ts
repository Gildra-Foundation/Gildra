import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const revalidate = 86400;

const paths = ["/", "/ru", "/database", "/ru/database", "/tier-lists", "/ru/tier-lists"];

export function GET() {
  const urls = paths.map((path) => `<url><loc>${xmlEscape(`${siteOrigin}${path}`)}</loc></url>`).join("");
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}
