import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/api-console", "/analytics", "/ru/analytics", "/dev/"] },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
