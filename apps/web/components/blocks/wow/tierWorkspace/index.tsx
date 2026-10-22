import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { AtlasFrame, AtlasHero, AtlasNotice, type AtlasStat } from "@/components/atlas";
import { TierSection } from "@/components/TierSection";
import { getGameIntelligence, type GameIntelligence } from "@/lib/platform/games/intelligence";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { tierCopy } from "./tierCopy";
import { sampleCount, sampleRoles, usesSample } from "./tierData";
import styles from "./tierWorkspace.module.css";
import "./tierWorkspace.css";
import { trail } from "@/lib/routes/registry";

/** Internal spec pages that exist (class/spec), so table rows can link to them. */
const specPaths = midnightSpecializations.map((spec) => `${spec.classSlug}/${spec.slug}`);

/** The full tier workspace: atlas hero, ONE honest sample notice when the meta
 *  API is off, then the interactive table + spec card (client). Hero counters
 *  appear only with live data (the sample's size is in the notice). design.md:
 *  it lives only on /tier-lists and is never embedded elsewhere. */
function TierWorkspace({ lang, data }: BlockComponentProps<EmptyProps, GameIntelligence>) {
  const copy = tierCopy[lang];
  const sample = usesSample(data);
  const mythic = data.tierLists?.mythic_plus?.roles ?? data.roles;
  const stats: AtlasStat[] = sample
    ? []
    : [
        { value: new Set(Object.values(mythic ?? {}).flat().map((entry) => `${entry.classSlug}:${entry.specSlug}`)).size, label: copy.statSpecs },
        { value: new Set((data.tierContexts ?? []).filter((item) => item.activity === "mythic_plus" && item.selectionType === "dungeon").map((item) => item.selectionId)).size, label: copy.statDungeons },
        { value: data.sources.filter((source) => source.status === "live").length, label: copy.statSources },
      ].filter((stat) => stat.value > 0);

  return (
    <AtlasFrame as="div" lang={lang} scene="tierLists" className={styles.frame} dataAttributes={{ "data-tier-workspace": true }}>
      <AtlasHero
        breadcrumbs={trail(lang, "tierLists")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={sample ? copy.ledeSample : copy.ledeLive}
        statsLabel={copy.statsLabel}
        stats={stats}
      />
      {sample ? <AtlasNotice tone="caution" title={copy.noticeTitle} className={styles.notice}>{copy.noticeText(sampleCount)}</AtlasNotice> : null}
      <TierSection lang={lang} intelligence={data} sample={sample} sampleRoles={sample ? sampleRoles : undefined} specPaths={specPaths} />
    </AtlasFrame>
  );
}

export const tierWorkspaceBlock = defineBlock<EmptyProps, GameIntelligence>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  load: (ctx) => getGameIntelligence("wow", ctx.lang),
  demo: { props: {}, data: { gameId: "wow", status: "unavailable", mode: "pending", version: "—", updatedAt: new Date(0).toISOString(), providerLabel: "Provider not connected", metrics: [], entities: [], sources: [], tierContexts: [] }, note: "Interactive workspace backed by the public meta API." },
});
