import type { GameSlug } from "@/lib/games/registry";
import { demoSource } from "./demo";
import type { DataSource } from "./source";

export type { DataSource } from "./source";

/**
 * Resolve the DataSource for a game. The demo dataset is the default; a live
 * implementation must be loaded lazily (`await import("./api")`) behind an
 * env check — `lib/api/client.ts` reads cookies() and would otherwise pull
 * every page into dynamic rendering.
 */
export function getSource(_game: GameSlug): DataSource {
  return demoSource;
}
