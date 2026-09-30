import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { TierSection } from "@/components/TierSection";
import { getGameIntelligence, type GameIntelligence } from "@/lib/platform/games/intelligence";

/** The full Mythic+ workspace (rail + table + detail + builds). design.md: it
 *  lives only on /tier-lists and is never embedded elsewhere. The client
 *  component owns its URL state; the language comes from the page config. */
function TierWorkspace({ lang, data }: BlockComponentProps<EmptyProps, GameIntelligence>) {
  return <TierSection lang={lang} intelligence={data} />;
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, GameIntelligence>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  load: (ctx) => getGameIntelligence("wow", ctx.lang),
  demo: { props: {}, data: { gameId: "wow", status: "unavailable", mode: "pending", version: "—", updatedAt: new Date(0).toISOString(), providerLabel: "Provider not connected", metrics: [], entities: [], sources: [], tierContexts: [] }, note: "Interactive workspace backed by the public meta API." },
});
