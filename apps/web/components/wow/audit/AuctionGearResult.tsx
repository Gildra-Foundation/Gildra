"use client";

import { useMemo, useRef, useState } from "react";
import type { AuctionGearAssemblyResult } from "@/lib/wow/auctionGearTypes";
import { auctionGearResults, recommendedAuctionGearResult, type AuctionGearResult as Result } from "@/lib/wow/auctionGearResult";
import { AuctionShoppingList } from "./AuctionShoppingList";
import { auctionFormats, formatGold, formatGoldRate } from "./auctionFormat";
import styles from "./auctionGearOptimizer.module.css";
import tools from "./characterTools.module.css";

type Props = { characterSlug: string; snapshotKey: string; assembly: AuctionGearAssemblyResult; locale: "en" | "ru"; stale: boolean;
  selectionLocked: boolean; onExcludeLot: (auctionId: number) => void };

export function AuctionGearResult({ characterSlug, snapshotKey, assembly, locale, stale, selectionLocked, onExcludeLot }: Props) {
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const { numeric, signed } = auctionFormats[locale];
  const money = (value: number | null) => value === null ? t("Неизвестна", "Unknown") : formatGold(value, locale);
  const candidates = useMemo(() => auctionGearResults(assembly), [assembly]);
  const recommended = recommendedAuctionGearResult(candidates, assembly.objective ?? "dps");
  const [selection, setSelection] = useState<{ searchId: string; key: string } | null>(null);
  const selected = (selection?.searchId === assembly.searchId && candidates.find(result => result.key === selection.key)) || recommended;
  const summary = useRef<HTMLHeadingElement>(null);
  if (!selected) return null;
  const label = (result: Result) => result.kind === "items" ? t("Только вещи", "Equipment only") : result.fullyEnhanced
    ? t("С камнями и чарами", "With gems and enchants") : t("Неполный комплект улучшений", "Partial enhancements");
  const alternatives = candidates.filter(candidate => candidate.key !== selected.key);
  const choose = (candidate: Result) => {
    setSelection({ searchId: assembly.searchId, key: candidate.key });
    summary.current?.focus();
  };

  return <div className={styles.result} data-auction-assembly-result data-exhaustive={assembly.exhaustiveComplete} data-price-state={stale ? "stale" : "calculated"} data-selected-result={selected.key}>
    <h4 ref={summary} tabIndex={-1} className={tools.subtitle} data-auction-primary-title>{selected.significant
      ? selected.key === recommended?.key ? t("Рекомендуемый комплект", "Recommended loadout") : t("Выбранный комплект", "Selected loadout")
      : t("Подтверждённого улучшения нет", "No confirmed upgrade")}</h4>
    <p className={styles.note}>{label(selected)} · {assembly.objective === "value" ? t("Подбор по цене за прирост DPS", "Selected by cost per DPS gain") : t("Подбор по максимуму DPS", "Selected for maximum DPS")}</p>
    {stale ? <p role="status" className={styles.staleResult}>{t("Цены не подтверждены — пересоберите сет перед покупкой.", "Prices are not verified — rebuild the loadout before buying.")}</p> : null}
    {!assembly.exhaustiveComplete || assembly.enhancementOptimization?.complete === false ? <p className={styles.note}>{t("Промежуточный результат: расчёт ещё не завершён.", "Interim result: calculation is still incomplete.")}</p> : null}
    {selected.kind === "items" ? <p className={styles.note}>{assembly.enhancementOptimization?.status === "pending"
      ? t("Камни и чары ещё подбираются; полная стоимость и остаток бюджета неизвестны.", "Gems and enchants are still being selected; full cost and remaining budget are unknown.")
      : t("Камни и чары для этого комплекта не подобраны; полная стоимость и остаток бюджета неизвестны.", "Gems and enchants have not been selected for this loadout; full cost and remaining budget are unknown.")}</p>
      : !selected.fullyEnhanced ? <p className={styles.note}>{t("Не все доступные камни и чары установлены в этом варианте.", "This option does not fill every available gem and enchant slot.")}</p> : null}
    {selected.kind === "enhanced" && selected.totalCopper === null ? <p className={styles.staleResult}>{t("Полная цена или доступность расходников не подтверждена; остаток бюджета неизвестен.", "Full consumable prices or availability are unverified; remaining budget is unknown.")}</p> : null}
    <p className={styles.note} data-auction-price-context>{t("Цены на момент расчёта", "Prices at calculation time")}</p>
    <dl className={styles.totals} data-auction-primary-cost>
      <div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(assembly.budgetCopper)}</dd></div>
      <div><dt>{t("Предметы", "Equipment")}</dt><dd>{money(selected.itemsCopper)}</dd></div>
      <div><dt>{t("Камни", "Gems")}</dt><dd>{money(selected.gemsCopper)}</dd></div>
      <div><dt>{t("Чары", "Enchants")}</dt><dd>{money(selected.enchantsCopper)}</dd></div>
      <div><dt>{t("Полная стоимость", "Total cost")}</dt><dd>{money(selected.totalCopper)}</dd></div>
      <div><dt>{t("Останется", "Remaining")}</dt><dd>{money(selected.remainingCopper)}</dd></div>
      {selected.significant && selected.totalCopper !== null ? <div><dt>{t("Цена за +1 DPS", "Cost per +1 DPS")}</dt><dd>{formatGoldRate(selected.totalCopper / selected.comparison.deltaDps, locale)}</dd></div> : null}
    </dl>
    <dl className={styles.dpsMetrics} data-auction-primary-dps>
      <div><dt>{t("Сейчас", "Current gear")}</dt><dd>{numeric.format(selected.comparison.baselineDps)} <span>DPS</span></dd></div>
      <div><dt>{t("С этим комплектом", "With this loadout")}</dt><dd>{numeric.format(selected.comparison.candidateDps)} <span>DPS</span></dd></div>
      <div className={selected.significant ? styles.gain : undefined}><dt>{t("Изменение", "Change")}</dt><dd>{signed.format(selected.comparison.deltaPercent)}% <span>{signed.format(selected.comparison.deltaDps)} ± {numeric.format(selected.comparison.uncertainty.marginDps)} DPS</span></dd></div>
    </dl>
    {!selected.significant ? <p role="status" className={tools.status}>{selected.comparison.deltaDps <= 0
      ? t("Этот вариант не улучшает текущую экипировку. Покупка не рекомендована.", "This option does not improve your current gear. Buying is not recommended.")
      : t("Прирост в пределах погрешности. Покупка не рекомендована.", "The gain is within the margin of error. Buying is not recommended.")}</p> : null}
    {selected.purchases.length || selected.enhancement?.configuration.consumables.length ? <AuctionShoppingList key={`${assembly.searchId}:${selected.key}`} characterSlug={characterSlug} snapshotKey={snapshotKey} searchId={assembly.searchId} result={selected} locale={locale} stale={stale} selectionLocked={selectionLocked} onExcludeLot={onExcludeLot} /> : null}
    {selected.removedSlots.includes("OFF_HAND") ? <p className={tools.status}>{t("Левая рука снимается ради двуручного оружия.", "The off-hand is removed for the two-handed weapon.")}</p> : null}
    {alternatives.length ? <details className={styles.disclosure} data-auction-result-alternatives><summary>{t("Другие рассчитанные комплекты", "Other computed loadouts")}</summary>
      <ul className={styles.alternatives}>{alternatives.map((candidate, index) => <li key={candidate.key}>
        <p className={styles.note}>{label(candidate)} · {candidate.purchases.map(item => item.name).join(" · ") || t("Текущая экипировка", "Current gear")}</p>
        <p>{money(candidate.totalCopper)} · {signed.format(candidate.comparison.deltaDps)} ± {numeric.format(candidate.comparison.uncertainty.marginDps)} DPS</p>
        <button className={tools.quiet} type="button" onClick={() => choose(candidate)} aria-label={`${t("Выбрать комплект", "Select loadout")} ${index + 1}: ${label(candidate)}`}>{t("Выбрать этот комплект", "Select this loadout")}</button>
      </li>)}</ul>
    </details> : null}
    {assembly.scenarioComparisons?.length ? <details className={styles.disclosure}><summary>{t("Сравнение в других боях", "Other encounter comparisons")}</summary>
      {assembly.scenarioComparisons.map(({ encounter, baseline, candidates: comparisons }) => <div key={JSON.stringify(encounter)}>
        <h4 className={tools.subtitle}>{encounter.targets} {t("целей", "targets")} · {encounter.fightLengthSeconds} {t("с", "s")}</h4>
        <p>{t("Текущая экипировка", "Current gear")}: {numeric.format(baseline.dps)} DPS</p>
        <ul>{comparisons.map(candidate => <li key={candidate.finalist}>{candidate.finalist.startsWith("enhanced-") ? t("С камнями и чарами", "With gems and enchants") : t("Только вещи", "Equipment only")}: {signed.format(candidate.comparison.deltaDps)} ± {numeric.format(candidate.comparison.uncertainty.marginDps)} DPS</li>)}</ul>
      </div>)}
    </details> : null}
  </div>;
}
