"use client";

import { useId, useState } from "react";
import { auctionGearPricePerDps, type AuctionGearRecommendationGroup } from "@/lib/wow/auctionGearRecommendations";
import { auctionGearVariantSelectionKey } from "@/lib/wow/auctionGearExclusions";
import type { AuctionGearSearchItem } from "@/lib/wow/auctionGearTypes";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./auctionGearOptimizer.module.css";
import tools from "./characterTools.module.css";
import { auctionFormats, formatGold, formatGoldRate } from "./auctionFormat";


type Props = {
  groups: AuctionGearRecommendationGroup[];
  locale: "ru" | "en";
  excluded: Set<string>;
  excludedVariantKeys: Set<string>;
  running: boolean;
  marketStale: boolean;
  slotName: (slot: string) => string;
  onAllowed: (id: string, allowed: boolean) => void;
};

export function AuctionGearSuggestions(props: Props) {
  return <ul className={styles.suggestions}>{props.groups.map(group =>
    <SlotSuggestion key={group.slotType} {...props} group={group} />)}</ul>;
}

function SlotSuggestion({ group, locale, excluded, excludedVariantKeys, running, marketStale, slotName, onAllowed }: Props & { group: AuctionGearRecommendationGroup }) {
  const [expanded, setExpanded] = useState(false);
  const alternativesId = useId();
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const { signed } = auctionFormats[locale];
  const money = (copper: number) => formatGold(copper, locale);
  const row = (item: AuctionGearSearchItem, best: boolean) => <div className={styles.suggestion} data-auction-option={item.optionId} data-auction-evaluation={item.evaluation} data-best-value={best || undefined}>
    <div className={styles.suggestionItem}><GearPlannerItem item={item} locale={locale} /></div>
    <dl className={styles.suggestionMetrics}>
      <div><dt>{marketStale ? t("Прежняя цена", "Previous price") : t("Цена", "Price")}</dt><dd>{money(item.lotCostCopper)}</dd></div>
      <div><dt>{t("Прирост", "Gain")}</dt><dd className={styles.confirmed}>{signed.format(item.comparison!.deltaDps)} DPS <small>({signed.format(item.comparison!.deltaPercent)}%)</small></dd></div>
      <div><dt>{t("Цена за +1 DPS", "Cost per +1 DPS")}</dt><dd>{formatGoldRate(auctionGearPricePerDps(item), locale)}</dd></div>
    </dl>
    <details className={styles.itemDetails}><summary aria-label={`${t("Сравнение и выбор для сета", "Comparison and loadout selection")}: ${item.name}, ${slotName(item.slotType)}`}>{t("Подробнее", "Details")}</summary>
      <div className={styles.replacement}><span>{t("Вместо", "Replaces")}</span>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : <span>—</span>}</div>
      <label className={styles.include}><input type="checkbox" checked={!excludedVariantKeys.has(auctionGearVariantSelectionKey(item))} disabled={running} onChange={event => onAllowed(item.optionId, event.target.checked)} aria-label={`${t("Учитывать вариант при сборке", "Allow variant in assembly")}: ${item.name}, ${slotName(item.slotType)}`} /><span>{t("Учитывать при сборке сета", "Use in loadout assembly")}</span></label>
    </details>
    {excludedVariantKeys.has(auctionGearVariantSelectionKey(item)) || excluded.has(item.optionId) ? <p className={styles.note}>{t("Исключён из сборки", "Excluded from assembly")}</p> : null}
  </div>;
  return <li className={styles.slotSuggestion} data-auction-slot={group.slotType}>
    <h5 className={styles.slotName}>{slotName(group.slotType)}</h5>
    {row(group.best, true)}
    {group.alternatives.length ? <><button className={tools.quiet} type="button" aria-expanded={expanded} aria-controls={alternativesId} onClick={() => setExpanded(value => !value)}>{expanded ? t("Скрыть альтернативы", "Hide alternatives") : t("Альтернативы", "Alternatives")} · {group.alternatives.length}<span className={styles.srOnly}> · {slotName(group.slotType)}</span></button>
      <div id={alternativesId}>{expanded ? <ul className={styles.alternatives}>{group.alternatives.map(item => <li key={item.optionId}>{row(item, false)}</li>)}</ul> : null}</div>
    </> : null}
  </li>;
}
