import { specPages } from "@/lib/specs";

/** Game-relative static paths listed in /sitemaps/static (both locales). */
export const staticPaths = (): string[] => [
  "/",
  "/library",
  "/database",
  "/tier-lists",
  "/privacy",
  ...specPages.map((p) => `/specs/${p.slug}`),
];
