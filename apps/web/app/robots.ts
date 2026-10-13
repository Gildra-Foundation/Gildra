import type { MetadataRoute } from "next";
import { runtimeFlags } from "@/lib/flags";
import { siteOrigin } from "@/lib/sitemap";

// Read per request: the same image serves production and the staging copy.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // The staging copy is closed to every crawler.
  if (runtimeFlags().staging) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/api-console", "/analytics", "/ru/analytics", "/dev/"] },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
