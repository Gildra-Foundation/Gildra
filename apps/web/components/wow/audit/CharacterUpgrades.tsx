"use client";

import { type CSSProperties, memo, useCallback, useId, useMemo, useState } from "react";
import { Coins, Gem, Landmark, Mountain, Sparkles, Swords } from "lucide-react";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { AuditGearQuality, CharacterAuditSnapshot } from "@/lib/wow/characterAudit";
import type { AuctionGearRecommendationGroup } from "@/lib/wow/auctionGearRecommendations";
import type { GearFarmResult } from "@/lib/wow/gearFarm/types";
import { buildUpgradePlan, filterUpgradePlan, upgradeFilterCounts, type UpgradeFilter, type UpgradeSlot, type UpgradeSource, type UpgradeSourceKind } from "@/lib/wow/upgradePlan";
import { AuctionGearOptimizer } from "./AuctionGearOptimizer";
import { GearFarmPlanner } from "./GearFarmPlanner";
import { GearPlannerItem } from "./GearPlannerItem";
import { auctionFormats, formatGold } from "./auctionFormat";
import { characterUpgradesCopy, upgradeSlotName, type CharacterUpgradesCopy } from "./characterUpgradesCopy";
import tools from "./characterTools.module.css";
import styles from "./characterUpgrades.module.css";

const qualityIndex: Partial<Record<AuditGearQuality, keyof typeof itemQualityColors>> = {
  "Низкое качество": 0, "Обычный": 1, "Необычный": 2, "Редкий": 3, "Эпический": 4, "Легендарный": 5, "Артефакт": 6, "Наследуемый": 7,
};
const qualityStyle = (quality: AuditGearQuality) => {
  const index = qualityIndex[quality];
  return (index === undefined ? undefined : { "--item-quality": itemQualityColors[index].text }) as CSSProperties | undefined;
};
const sourceIcons: Record<UpgradeSourceKind, typeof Coins> = { dungeon: Landmark, raid: Swords, world: Mountain, auction: Coins };
const filters: UpgradeFilter[] = ["attention", "sources", "fixes", "all"];

/**
 * The Upgrades tab of a character page: what to upgrade (every slot, measured gains first, then the weakest
 * by item level, with enchant/gem fixes and the best replacement found), then the dungeon/raid loot search and
 * the Auction House search. Their confirmed results feed the slot list, so nothing is fetched twice.
 */
export function CharacterUpgrades({ snapshot, snapshotKey, localePrefix, plaqueClassName }: {
  snapshot: CharacterAuditSnapshot;
  snapshotKey: string;
  localePrefix: "" | "/ru";
  plaqueClassName?: string;
}) {
  const [farm, setFarm] = useState<GearFarmResult | null>(null);
  const [auction, setAuction] = useState<AuctionGearRecommendationGroup[] | null>(null);
  const onAuction = useCallback((groups: AuctionGearRecommendationGroup[] | null) => setAuction(groups?.length ? groups : null), []);
  return <>
    <MaterialPlaque kit={CHARACTERS_KIT} className={plaqueClassName}>
      <UpgradeOverview snapshot={snapshot} farm={farm} auction={auction} ru={localePrefix === "/ru"} />
    </MaterialPlaque>
    <MaterialPlaque kit={CHARACTERS_KIT} className={plaqueClassName}>
      <GearFarmPlanner characterSlug={snapshot.slug} snapshotKey={snapshotKey} localePrefix={localePrefix} onResult={setFarm} />
    </MaterialPlaque>
    <MaterialPlaque kit={CHARACTERS_KIT} className={plaqueClassName}>
      <AuctionGearOptimizer characterSlug={snapshot.slug} snapshotKey={snapshotKey} specializationSlug={snapshot.specialization.slug} localePrefix={localePrefix} onRecommendations={onAuction} />
    </MaterialPlaque>
  </>;
}

export function UpgradeOverview({ snapshot, farm, auction, ru }: {
  snapshot: CharacterAuditSnapshot;
  farm: GearFarmResult | null;
  auction: readonly AuctionGearRecommendationGroup[] | null;
  ru: boolean;
}) {
  const c = characterUpgradesCopy(ru);
  const titleId = useId();
  const [filter, setFilter] = useState<UpgradeFilter>("attention");
  const plan = useMemo(() => buildUpgradePlan({ gear: snapshot.gear, averageItemLevel: snapshot.character.itemLevel, farm, auction }),
    [snapshot.gear, snapshot.character.itemLevel, farm, auction]);
  const counts = useMemo(() => upgradeFilterCounts(plan), [plan]);
  // A filter without slots (nothing to fix, no search yet) falls back to every slot.
  const active = counts[filter] ? filter : "all";
  const rows = useMemo(() => filterUpgradePlan(plan, active), [plan, active]);
  const withSources = counts.sources > 0;
  if (!plan.length) return null;
  return <section className={tools.tool} aria-labelledby={titleId} data-upgrade-overview>
    <div className={tools.head}>
      <h3 className={tools.title} id={titleId}>{c.title}</h3>
      <div className={styles.filters} role="group" aria-label={c.filters}>
        {filters.filter((id) => id === "all" || counts[id] > 0).map((id) => <button key={id} type="button" className={styles.filter}
          aria-pressed={active === id} onClick={() => setFilter(id)}>
          {c.filter[id]}<span>{counts[id]}</span>
        </button>)}
      </div>
    </div>
    <ol className={styles.slots} data-sources={withSources || undefined}>
      {rows.map((row) => <SlotRow key={row.slotType} row={row} c={c} ru={ru} withSources={withSources} />)}
    </ol>
  </section>;
}

const SlotRow = memo(function SlotRow({ row, c, ru, withSources }: { row: UpgradeSlot; c: CharacterUpgradesCopy; ru: boolean; withSources: boolean }) {
  const { item } = row;
  const tone = row.gap >= 8 ? "critical" : row.gap >= 1 ? "behind" : undefined;
  return <li className={styles.row} data-upgrade-slot={row.slotType} data-tone={tone}>
    <span className={`${materialStyles.iconFrame} ${styles.icon}`} style={materialIconFrameStyle(CHARACTERS_KIT, 44)}>
      {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" decoding="async" width={44} height={44} /> : null}
    </span>
    <span className={styles.identity} style={qualityStyle(item.details.quality)}>
      <span className={styles.meta}>
        <small>{upgradeSlotName(row.slotType, ru)}</small>
        {row.missingEnchant ? <span className={styles.fix}><Sparkles aria-hidden="true" />{c.noEnchant}</span> : null}
        {row.emptySockets ? <span className={styles.fix}><Gem aria-hidden="true" />{row.emptySockets > 1 ? c.emptySockets(row.emptySockets) : c.emptySocket}</span> : null}
      </span>
      <b title={item.name}>{item.name}</b>
    </span>
    <span className={styles.level}>
      <strong>{item.itemLevel}</strong>
      {row.gap !== 0 ? <small aria-label={row.gap > 0 ? c.behind(row.gap) : c.ahead(-row.gap)}>{row.gap > 0 ? `−${row.gap}` : `+${-row.gap}`}</small> : null}
    </span>
    {withSources ? <span className={styles.source}>{row.best ? <SourceBadge source={row.best} more={row.sources.length - 1} c={c} ru={ru} /> : null}</span> : null}
  </li>;
});

function SourceBadge({ source, more, c, ru }: { source: UpgradeSource; more: number; c: CharacterUpgradesCopy; ru: boolean }) {
  const Icon = sourceIcons[source.kind];
  const locale = ru ? "ru" : "en";
  const where = source.kind === "auction" ? c.source.auction : source.place;
  const detail = source.kind === "auction" ? source.priceCopper !== undefined ? formatGold(source.priceCopper, locale) : "" : [c.source[source.kind], source.encounter].filter(Boolean).join(" · ");
  return <span className={styles.badge} data-source={source.kind}>
    <GearPlannerItem item={source.item} locale={locale} compact />
    <span className={styles.badgeCopy}>
      <b><Icon aria-hidden="true" />{where}</b>
      <small>{[detail, more > 0 ? c.more(more) : ""].filter(Boolean).join(" · ")}</small>
    </span>
    <strong className={styles.gain} aria-label={`${c.gain} ${auctionFormats[locale].signed.format(source.deltaPercent)}%`}>{auctionFormats[locale].signed.format(source.deltaPercent)}%</strong>
  </span>;
}
