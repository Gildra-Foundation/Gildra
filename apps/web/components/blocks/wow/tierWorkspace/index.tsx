import { connection } from "next/server";
import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice } from "@/components/atlas";
import { MaterialLinkButton, MythicHubBackdrop } from "@/components/wow/shared/materialAtlas";
import { ANCHORS } from "@/lib/anchors";
import { p } from "@/lib/i18n-paths";
import { TierSection } from "@/components/TierSection";
import type { TierSpecNames } from "./tierBoardRows";
import { getGameIntelligence, type GameIntelligence } from "@/lib/platform/games/intelligence";
import { getTierSources } from "@/lib/platform/games/tierSources";
import type { TierSourceTabs } from "./tierSourceKeys";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import type { Lang } from "@/lib/i18n-paths";
import { tierCopy } from "./tierCopy";
import { sampleCount, sampleRoles, usesSample } from "./tierData";
import styles from "./tierWorkspace.module.css";
import "./tierWorkspace.css";
import { trail } from "@/lib/routes/registry";

/** Names, hero talent trees and the talents page of every spec, so the client does not bundle the whole spec theme file. */
const specNames: Record<Lang, TierSpecNames> = {
  en: Object.fromEntries(talentSpecThemes.map((theme) => [theme.slug, { specName: theme.specName, className: theme.className, heroes: [theme.heroPaths[0].name, theme.heroPaths[1].name], talents: theme.slug }])),
  ru: Object.fromEntries(talentSpecThemes.map((theme) => [theme.slug, { specName: theme.specNameRu, className: theme.classNameRu, heroes: [theme.heroPaths[0].nameRu, theme.heroPaths[1].nameRu], talents: theme.slug }])),
};

/** The full tier workspace: atlas hero, ONE honest sample notice when the meta
 *  API is off, then the interactive tier board / list (client). design.md:
 *  it lives only on /tier-lists and is never embedded elsewhere. */
/** Meta intelligence plus the source tabs that have a published list. */
type TierWorkspaceData = GameIntelligence & { sourceTabs: TierSourceTabs };

function TierWorkspace({ lang, data }: BlockComponentProps<EmptyProps, TierWorkspaceData>) {
  const copy = tierCopy[lang];
  const sample = usesSample(data);

  // The hero of the fixed reference (Mythic+ meta): the hub's gateway on the right, title, two painted buttons, the counters under them.
  return (
    <AtlasFrame as="div" lang={lang} className={styles.frame} still foot={false} dataAttributes={{ "data-tier-workspace": true }}>
      <MythicHubBackdrop />
      <div className={styles.hero}>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={trail(lang, "tierLists")}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          eyebrow={copy.eyebrow}
          title={copy.title}
          actions={<div className={styles.heroActions}>
            <MaterialLinkButton kit="tier-lists" fit="stack" className={styles.heroButton} href={`#${ANCHORS.builds}`} variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.heroRanking}</MaterialLinkButton>
            <MaterialLinkButton kit="kings-rest" fit="stack" className={styles.heroButton} href={p(lang, "/wow/mythic-plus/meta")} iconAfter={<ArrowUpRight aria-hidden="true" />}>{copy.heroMeta}</MaterialLinkButton>
          </div>}
        />
      </div>
      {sample ? <AtlasNotice tone="caution" title={copy.noticeTitle} className={styles.notice}>{copy.noticeText(sampleCount)}</AtlasNotice> : null}
      <TierSection lang={lang} intelligence={data} sample={sample} sampleRoles={sample ? sampleRoles : undefined} specNames={specNames[lang]} sourceTabs={sample ? undefined : data.sourceTabs} />
    </AtlasFrame>
  );
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, TierWorkspaceData>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  load: async (ctx) => {
    // Rendered per request: WOW_META_API_ENABLED is a runtime switch, and a
    // prerendered page would keep the build's sample until the next release.
    await connection();
    const [intelligence, sourceTabs] = await Promise.all([getGameIntelligence("wow", ctx.lang), getTierSources()]);
    return { ...intelligence, sourceTabs };
  },
  demo: { props: {}, data: { gameId: "wow", status: "unavailable", mode: "pending", version: "—", updatedAt: new Date(0).toISOString(), providerLabel: "Provider not connected", metrics: [], entities: [], sources: [], tierContexts: [], sourceTabs: { tabs: [], ladder: false } }, note: "Interactive workspace backed by the public meta API." },
});
