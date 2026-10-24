import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { TierSection } from "@/components/TierSection";
import { getGameIntelligence, type GameIntelligence } from "@/lib/platform/games/intelligence";
import { tierCopy } from "./tierCopy";
import styles from "./tierWorkspace.module.css";
import "./tierWorkspace.css";
import { trail } from "@/lib/routes/registry";
import { connection } from "next/server";

function TierWorkspace({ lang, data }: BlockComponentProps<EmptyProps, GameIntelligence>) {
  const copy = tierCopy[lang];

  return (
    <AtlasFrame as="div" lang={lang} scene="tierLists" className={styles.frame} dataAttributes={{ "data-tier-workspace": true }}>
      <AtlasHero
        breadcrumbs={trail(lang, "tierLists")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.ledeLive}
      />
      <TierSection lang={lang} intelligence={data} />
    </AtlasFrame>
  );
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, GameIntelligence>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  load: async (ctx) => {
    // Ratings depend on a live provider; its availability must not hold up a build.
    // The provider requests retain their five-minute data cache.
    await connection();
    return getGameIntelligence("wow", ctx.lang);
  },
  demo: { props: {}, data: { gameId: "wow", status: "unavailable", mode: "pending", version: "—", updatedAt: new Date(0).toISOString(), providerLabel: "Provider not connected", metrics: [], entities: [], sources: [], tierContexts: [] }, note: "Interactive workspace backed by the public meta API." },
});
