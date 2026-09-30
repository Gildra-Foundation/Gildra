import type { GameSlug } from "@/lib/games/registry";
import type { DataSource } from "./source";

export type { DataSource } from "./source";

/**
 * Public pages must never silently substitute gallery/demo values for a
 * missing provider. Blocks that still depend on this legacy contract fail
 * closed until a source-backed implementation is connected.
 */
export function getSource(_game: GameSlug): DataSource {
  const unavailable = async (): Promise<never> => {
    throw new Error("No published source is connected for this legacy block");
  };
  return {
    season: unavailable,
    liveStats: unavailable,
    patchHighlights: unavailable,
    mythicMeta: unavailable,
    trends: unavailable,
    raid: unavailable,
    tierTable: unavailable,
    classChips: unavailable,
    builds: unavailable,
    guides: unavailable,
  };
}
