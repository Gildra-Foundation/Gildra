import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import base from "./rubySanctuaryTheme.module.css";
import scenes from "./dungeonSceneThemes.module.css";

export function dungeonThemeClass(slug: DungeonSlug) {
  return `${base.rubyTheme} ${scenes[slug] ?? ""}`;
}
