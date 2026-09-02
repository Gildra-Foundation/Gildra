import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { TierSection } from "@/components/TierSection";

/** The full Mythic+ workspace (rail + table + detail + builds). design.md: it
 *  lives only on /tier-lists and is never embedded elsewhere. The client
 *  component owns its URL state; the language comes from the page config. */
function TierWorkspace({ lang }: BlockComponentProps<EmptyProps, undefined>) {
  return <TierSection lang={lang} />;
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, undefined>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  demo: { props: {}, data: undefined, note: "Interactive workspace; state lives in the URL." },
});
