import { connection } from "next/server";
import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice } from "@/components/atlas";
import { MaterialLinkButton, MythicHubBackdrop } from "@/components/wow/shared/materialAtlas";
import { ANCHORS } from "@/lib/anchors";
import { p } from "@/lib/i18n-paths";
import { TierSection } from "@/components/TierSection";
import type { TierSpecNames } from "./tierBoardRows";
import { getGameIntelligence, type GameIntelligence } from "@/lib/platform/games/intelligence";
import { getTierSources } from "@/lib/platform/games/tierSources";
import { listParams, sourceKey, type PvpBracket, type SourceSlice, type TierMode, type TierSourceSlices, type TierSourceTabs } from "./tierSourceKeys";
import { internalApiJson } from "@/lib/api/internal";
import type { TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import type { Lang } from "@/lib/i18n-paths";
import { tierCopy } from "./tierCopy";
import { tierSourcesCopy } from "./tierSourcesCopy";
import { sampleCount, sampleRoles, usesSample } from "./tierData";
import styles from "./tierWorkspace.module.css";
import "./tierWorkspace.css";
import { trail } from "@/lib/routes/registry";
import { JsonLd } from "@/lib/seo/jsonld";
import { tierListLd } from "@/lib/seo/itemLists";

/** Names, hero talent trees and the talents page of every spec, so the client does not bundle the whole spec theme file. */
const specNames: Record<Lang, TierSpecNames> = {
  en: Object.fromEntries(talentSpecThemes.map((theme) => [theme.slug, { specName: theme.specName, className: theme.className, heroes: [theme.heroPaths[0].name, theme.heroPaths[1].name], talents: theme.slug }])),
  ru: Object.fromEntries(talentSpecThemes.map((theme) => [theme.slug, { specName: theme.specNameRu, className: theme.classNameRu, heroes: [theme.heroPaths[0].nameRu, theme.heroPaths[1].nameRu], talents: theme.slug }])),
};

/** The full tier workspace: atlas hero, ONE honest sample notice when the meta
 *  API is off, then the interactive tier board / list (client). design.md:
 *  it lives only on /tier-lists and is never embedded elsewhere. */
/** The mode the page opens on: /tier-lists (Mythic+), /tier-lists/raid, /tier-lists/arena[/<bracket>]. */
type TierWorkspaceProps = { mode?: TierMode; bracket?: PvpBracket };
/** Meta intelligence, the source tabs that have a published list and, on an arena page, its ladder list. */
type TierWorkspaceData = GameIntelligence & { sourceTabs: TierSourceTabs; slices?: TierSourceSlices };

const ROLES: TierRole[] = ["dps", "healer", "tank"];

/** Gildra's arena tier (the Blizzard ladder) of one bracket, rendered with the page; none when it is not published. */
async function ladderSlice(bracket: PvpBracket): Promise<TierSourceSlices> {
  const query = { source: "gildra" as const, mode: "pvp" as const, bracket, region: "all" as const };
  try {
    const lists = await Promise.all(ROLES.map(async (role) => {
      try {
        return await internalApiJson<{ entries: TierEntry[]; updatedAt: string; tiersDerived?: boolean }>(`/v1/meta/wow/tier-list?${listParams(query, role)}`, {
          label: "arena tier list", timeoutMs: 3_000, next: { revalidate: 300, tags: ["game-intelligence"] },
        });
      } catch {
        // A role the ladder does not rank (no tanks in an arena list) is an empty row.
        return { entries: [], updatedAt: "" };
      }
    }));
    if (lists.every((list) => !list.entries.length)) return {};
    const slice: SourceSlice = {
      roles: Object.fromEntries(ROLES.map((role, index) => [role, lists[index].entries])) as Record<TierRole, TierEntry[]>,
      updatedAt: lists.map((list) => list.updatedAt).filter(Boolean).sort()[0] ?? "",
      tiersDerived: lists.some((list) => "tiersDerived" in list && list.tiersDerived),
    };
    return { [sourceKey(query)]: slice };
  } catch (error) {
    console.error("arena tier list unavailable", error);
    return {};
  }
}

function TierWorkspace({ lang, data, mode = "mythic_plus", bracket = "3v3" }: BlockComponentProps<TierWorkspaceProps, TierWorkspaceData>) {
  const copy = tierCopy[lang];
  const sample = usesSample(data);

  // The hero of the fixed reference (Mythic+ meta): the hub's gateway on the right, title, two painted buttons, the counters under them.
  return (
    <AtlasFrame lang={lang} className={styles.frame} still foot={false} dataAttributes={{ "data-tier-workspace": true }}>
      <MythicHubBackdrop />
      {sample ? null : <JsonLd data={tierListLd(lang, data, mode, bracket)} />}
      <div className={styles.hero}>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={mode === "mythic_plus" || sample ? trail(lang, "tierLists") : trail(lang, "tierLists", { label: mode === "pvp" && bracket !== "3v3" ? `${copy.modes.pvp} ${tierSourcesCopy[lang].brackets[bracket]}` : copy.modes[mode] })}
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
      <TierSection lang={lang} intelligence={data} sample={sample} sampleRoles={sample ? sampleRoles : undefined} specNames={specNames[lang]} sourceTabs={sample ? undefined : data.sourceTabs}
        initialMode={sample ? "mythic_plus" : mode} initialBracket={bracket} initialSlices={data.slices} />
    </AtlasFrame>
  );
}

export const tierWorkspaceBlock = defineBlock<TierWorkspaceProps, TierWorkspaceData>({
  type: "wow.tierWorkspace",
  Component: TierWorkspace,
  load: async (ctx, props) => {
    // Rendered per request: WOW_META_API_ENABLED is a runtime switch, and a
    // prerendered page would keep the build's sample until the next release.
    await connection();
    const [intelligence, sourceTabs] = await Promise.all([getGameIntelligence("wow", ctx.lang), getTierSources()]);
    const slices = props.mode === "pvp" && sourceTabs.ladder ? await ladderSlice(props.bracket ?? "3v3") : undefined;
    return { ...intelligence, sourceTabs, ...(slices ? { slices } : {}) };
  },
  demo: { props: {}, data: { gameId: "wow", status: "unavailable", mode: "pending", version: "—", updatedAt: new Date(0).toISOString(), providerLabel: "Provider not connected", metrics: [], entities: [], sources: [], tierContexts: [], sourceTabs: { tabs: [], ladder: false } }, note: "Interactive workspace backed by the public meta API." },
});
