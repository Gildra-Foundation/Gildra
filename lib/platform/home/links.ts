import type { Lang } from "@/lib/i18n";

const legacyPaths: Record<string, string> = {
  "/wow/specs/fury-warrior": "/talents/fury-warrior",
  "/wow/mythic-plus/planner/the-rookery": "/wow/mythic-plus",
  "/genshin/abyss/floor-12": "/genshin/characters/raidenshogun",
  "/genshin/teams/raiden-national": "/genshin/characters/raidenshogun",
  "/genshin/teams/new": "/genshin",
  "/genshin/rotation/raiden-shogun": "/genshin/characters/raidenshogun",
  "/genshin/characters/raiden-shogun": "/genshin/characters/raidenshogun",
  "/diablo/builds/quill-volley": "/diablo",
  "/diablo/tier-list": "/diablo",
  "/league-of-legends/live/arcanist": "/league-of-legends/champions/ahri",
  "/league-of-legends/builds/ahri": "/league-of-legends/champions/ahri",
  "/league-of-legends/matchups/ahri": "/league-of-legends/champions/ahri",
  "/profile/arcanist-vexis": "/profile/arcanist",
};

/** Keep fixture-backed product links inside the active locale without double-prefixing. */
export function platformHref(href: string, lang: Lang) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("#")) return href;
  const [rawPath, query] = href.split("?", 2);
  const unlocalized = rawPath === "/ru" ? "/" : rawPath.startsWith("/ru/") ? rawPath.slice(3) : rawPath;
  const canonical = legacyPaths[unlocalized] ?? unlocalized;
  const target = query ? `${canonical}?${query}` : canonical;
  if (lang === "ru") return target === "/" ? "/ru" : `/ru${target}`;
  return target;
}
