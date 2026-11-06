import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import base from "./rubySanctuaryTheme.module.css";
import scenes from "./dungeonSceneThemes.module.css";
import { atlasBridgeClassName } from "@gildra/atlas-ui/atlasRoot";

/** The palette re-themes the atlas base tokens, so the Valyro bridge is re-declared on the same element. */
export function dungeonThemeClass(slug: DungeonSlug) {
  return `${base.rubyTheme} ${scenes[slug] ?? ""} ${atlasBridgeClassName}`;
}
