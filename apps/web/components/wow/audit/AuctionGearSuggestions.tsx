"use client";

import { useId, useState } from "react";
import { auctionGearPricePerDps, type AuctionGearRecommendationGroup } from "@/lib/wow/auctionGearRecommendations";
import { auctionGearVariantSelectionKey } from "@/lib/wow/auctionGearExclusions";
import type { AuctionGearSearchItem } from "@/lib/wow/auctionGearTypes";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./auctionGearOptimizer.module.css";
import { auctionFormats, formatGold } from "./auctionFormat";


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
  const { numeric, signed } = auctionFormats[locale];
  const money = (copper: number) => formatGold(copper, locale);
  const row = (item: AuctionGearSearchItem, best: boolean) => <div className={styles.suggestion} data-auction-option={item.optionId} data-auction-evaluation={item.evaluation} data-best-value={best || undefined}>
    <div className={styles.suggestionItem}><GearPlannerItem item={item} locale={locale} /></div>
    <div className={styles.suggestionMetrics}>
      <span><span className={styles.label}>{marketStale ? t("Прежняя цена", "Previous price") : t("Цена лота", "Lot price")}</span><strong>{money(item.lotCostCopper)}</strong></span>
      <span><span className={styles.label}>{t("Прирост DPS", "DPS gain")}</span><strong className={styles.confirmed}>{signed.format(item.comparison!.deltaDps)} DPS <small>({signed.format(item.comparison!.deltaPercent)}%)</small></strong></span>
      <span><span className={styles.label}>{t("Цена за +1 DPS", "Cost per +1 DPS")}</span><strong>{auctionGearPricePerDps(item) < 1 ? `<${money(1)}` : money(auctionGearPricePerDps(item))}</strong></span>
    </div>
    <details className={styles.itemDetails}><summary aria-label={`${t("Сравнение и выбор для сета", "Comparison and loadout selection")}: ${item.name}, ${slotName(item.slotType)}`}>{t("Сравнение и выбор для сета", "Comparison and loadout selection")}</summary>
      <div className={styles.optionDetails}><p className={styles.note}>{numeric.format(item.comparison!.confidence)}% {t("доверительный интервал", "confidence interval")}: ±{numeric.format(item.comparison!.uncertainty.marginPercent)}%. {t("Количество в лоте", "Lot quantity")}: {item.quantity}.</p>
        <label className={styles.include}><input type="checkbox" checked={!excludedVariantKeys.has(auctionGearVariantSelectionKey(item))} disabled={running} onChange={event => onAllowed(item.optionId, event.target.checked)} aria-label={`${t("Учитывать вариант при сборке", "Allow variant in assembly")}: ${item.name}, ${slotName(item.slotType)}`} /><span>{t("Учитывать вариант при сборке", "Allow variant in assembly")}</span></label><p className={styles.note}>{t("Выбор действует на все лоты этого варианта и все подходящие слоты.", "This choice applies to every lot of this exact variant across all eligible slots.")}</p>
      </div>
      <div className={styles.replacement}><span>{t("Заменяет", "Replaces")}</span>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : <span className={styles.note}>{t("Надетый предмет не указан.", "Equipped item details are unavailable.")}</span>}</div>
    </details>
    {excludedVariantKeys.has(auctionGearVariantSelectionKey(item)) ? <p className={styles.note}>{t("Исключён из сборки сета", "Excluded from loadout assembly")}</p> : excluded.has(item.optionId) ? <p className={styles.note}>{t("Этот лот исключён. Другие лоты варианта разрешены.", "This lot is excluded. Other lots of this variant remain allowed.")}</p> : null}
  </div>;
  return <li className={styles.slotSuggestion} data-auction-slot={group.slotType}>
    <div className={styles.suggestionHeading}><h3>{slotName(group.slotType)}</h3><span className={styles.valueLabel}>{t("Лучшее соотношение цены и DPS", "Best value for DPS")}</span></div>
    {row(group.best, true)}
    {group.alternatives.length ? <><button className={styles.button} type="button" aria-expanded={expanded} aria-controls={alternativesId} onClick={() => setExpanded(value => !value)}>{expanded ? t("Скрыть альтернативы", "Hide alternatives") : t("Альтернативы", "Alternatives")} · {group.alternatives.length}<span className={styles.srOnly}> · {slotName(group.slotType)}</span></button>
      <div id={alternativesId}>{expanded ? <ul className={styles.alternatives}>{group.alternatives.map(item => <li key={item.optionId}>{row(item, false)}</li>)}</ul> : null}</div>
    </> : null}
  </li>;
}
