import { defineBlock, type EmptyProps } from "@/lib/blocks/types";
import { TierSection } from "@/components/TierSection";

/** The full Mythic+ workspace (rail + table + detail + builds). design.md: it
 *  lives only on /tier-lists and is never embedded elsewhere. The client
 *  component owns its URL state and derives the language from the pathname. */
function TierWorkspace() {
  return <TierSection />;
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, undefined>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  demo: { props: {}, data: undefined, note: "Interactive workspace; state lives in the URL." },
});
