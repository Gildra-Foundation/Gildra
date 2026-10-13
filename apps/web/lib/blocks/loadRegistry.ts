import "server-only";
import type { GameSlug } from "@/lib/games/registry";
import type { AnyBlockDef } from "./types";

export type BlockRegistry = Record<string, AnyBlockDef>;

/** Load only the block components used by the current game's page tree. */
export async function loadBlockRegistry(game: GameSlug): Promise<BlockRegistry> {
  if (game === "wow") return (await import("./registries/wow")).wowRegistry;
  if (game === "league-of-legends") return (await import("./registries/league")).leagueRegistry;
  return (await import("./registries/shared")).sharedRegistry;
}
