import { CONTENT_CATEGORIES } from "@/components/blocks/league-of-legends/contentCategory";

/** Game-relative static paths listed in /sitemaps/static (both locales). */
export const staticPaths = (): string[] => [
  "/",
  ...Object.keys(CONTENT_CATEGORIES).map((category) => `/content/${category}`),
];
