"use client";

import { useMemo, useRef, useState } from "react";
import { auctionGearAssemblyGoalComplete } from "@/lib/wow/auctionGearEnhancementMode";
import type { AuctionGearAssemblyResult } from "@/lib/wow/auctionGearTypes";
import { auctionGearResults, recommendedAuctionGearResult, auctionGearLoadoutComparison, type AuctionGearResult as Result } from "@/lib/wow/auctionGearResult";
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
  const comparison = useMemo(() => auctionGearLoadoutComparison(candidates), [candidates]);
  const [selection, setSelection] = useState<{ searchId: string; key: string } | null>(null);
  const selected = (selection?.searchId === assembly.searchId && candidates.find(result => result.key === selection.key)) || recommended;
  const summary = useRef<HTMLHeadingElement>(null);
  if (!selected) return null;
  const label = (result: Result) => result.kind === "items" ? t("Только вещи", "Equipment only") : result.fullyEnhanced
    ? t("С камнями и чарами", "With gems and enchants") : t("Неполный комплект улучшений", "Partial enhancements");
  const alternatives = candidates.filter(candidate => candidate.key !== selected.key && candidate.key !== comparison?.value.key && candidate.key !== comparison?.dps.key);
  const choose = (candidate: Result) => {
    setSelection({ searchId: assembly.searchId, key: candidate.key });
    summary.current?.focus();
  };

  const equipmentOnly = assembly.enhancementMode === "equipment";
  const stage = assembly.enhancementOptimization;
  const recheck = stage?.finalistRecheck;
  const pricesFor = (keys: readonly string[]) => keys.flatMap(key => {
    const amount = stage?.recommendations.find(row => row.configuration.key === key)?.configuration.totalCopper;
    return typeof amount === "number" ? [amount] : [];
  }).sort((a, b) => a - b);
  const finalistPrices = pricesFor(recheck?.keys ?? []);
  const tiedPrices = pricesFor(recheck?.indistinguishableKeys ?? (recheck && !recheck.significant ? recheck.keys : []));
  const listPrices = (prices: number[]) => new Intl.ListFormat(ru ? "ru" : "en", { type: "conjunction" }).format(prices.map(money));
  const leaderPrice = recheck?.leaderKey ? pricesFor([recheck.leaderKey])[0] : undefined;
  const complete = auctionGearAssemblyGoalComplete(assembly);
  const exhaustiveEnhancements = stage?.traversal === "exhaustive";
  const limitedEnhancements = !exhaustiveEnhancements && assembly.enhancementMode === "enhanced" && stage?.searchLimited;
  return <div className={styles.result} data-auction-assembly-result data-exhaustive={complete} data-price-state={stale ? "stale" : "calculated"} data-selected-result={selected.key}>
    <h4 ref={summary} tabIndex={-1} className={tools.subtitle} data-auction-primary-title>{selected.significant
      ? selected.key === recommended?.key ? t("Рекомендуемый комплект", "Recommended loadout") : t("Выбранный комплект", "Selected loadout")
      : t("Подтверждённого улучшения нет", "No confirmed upgrade")}</h4>
    {stale ? <p role="status" className={styles.staleResult}>{t("Цены устарели. Обновите комплект перед покупкой.", "Prices are out of date. Refresh the loadout before buying.")}</p> : null}
    <dl className={styles.decisionMetrics}>
      <div data-auction-primary-cost><dt>{selected.totalCopper !== null ? t("Стоимость комплекта", "Loadout cost") : t("Стоимость вещей", "Equipment cost")}</dt>
        <dd>{money(selected.totalCopper ?? selected.itemsCopper)}{selected.totalCopper === null ? <span className={styles.metricNote}>{t("Полная стоимость", "Total cost")}: {money(null)}</span> : null}</dd></div>
      <div className={selected.significant ? styles.gain : undefined} data-auction-primary-dps><dt>{t("Прирост DPS", "DPS gain")}</dt>
        <dd>{signed.format(selected.comparison.deltaPercent)}%<span className={styles.metricNote}>{signed.format(selected.comparison.deltaDps)} ± {numeric.format(selected.comparison.uncertainty.marginDps)} DPS</span></dd></div>
    </dl>
    <p className={styles.note} data-auction-price-context>{t("Цены на момент расчёта", "Prices at calculation time")}</p>
    {finalistPrices.length >= 2 && recheck && (recheck.leaderKey || !recheck.significant) ? <p className={styles.note} data-auction-close-finalists>
      {t("С повышенной точностью проверены комплекты за ", "The higher-precision simulation compared loadouts priced at ")}{listPrices(finalistPrices)}.
      {tiedPrices.length > 1 ? <>
        {tiedPrices.length === finalistPrices.length ? t(" Все эти варианты оказались в пределах погрешности лучшего измеренного DPS.", " All were within simulation uncertainty of the highest measured DPS.") :
          <>{t(" У комплектов за ", " The loadouts priced at ")}{listPrices(tiedPrices)}
            {t(" разница с лучшим измеренным DPS в пределах погрешности.", " were within simulation uncertainty of the highest measured DPS.")}</>}
        {tiedPrices[0] < tiedPrices[tiedPrices.length - 1] ? t(" Доплата между этими вариантами не даёт подтверждённого прироста DPS.", " Paying more among these options gives no confirmed DPS gain.") : ""}
      </> : leaderPrice !== undefined ? <>{t(" У комплекта за ", " The loadout priced at ")}{money(leaderPrice)}
        {t(" подтверждено преимущество по DPS над остальными финалистами.", " had a confirmed DPS advantage over the other rechecked finalists.")}</> : null}
    </p> : null}
    {recheck?.competingKey ? <p className={styles.note}>{t(
      "Ещё один комплект остаётся среди лидеров по исходной симуляции. Повышенная точность применялась только к двум первоначальным лидерам.",
      "Another loadout remains in contention on its original measurement. Only the two original leaders were rechecked at higher precision."
    )}</p> : null}
    {comparison ? <div className={styles.loadoutComparison} role="group" aria-label={t("Сравнение проверенных комплектов", "Compare checked loadouts")} data-auction-loadout-comparison>
      <p className={styles.note}>{t("Среди проверенных вариантов", "Among the options checked")}</p>
      {(["value", "dps"] as const).map(objective => {
        const candidate = comparison[objective];
        const title = objective === "value" ? t("Выгодный комплект", "Best value loadout") : t("Максимум подтверждённого DPS", "Highest confirmed DPS");
        return <div key={objective} className={styles.comparisonOption} data-auction-comparison-option={objective} data-selected={selected.key === candidate.key || undefined}>
          <h5 className={styles.comparisonTitle}>{title}</h5>
          <dl className={styles.comparisonMetrics}>
            <div><dt>{t("Стоимость", "Cost")}</dt><dd>{money(candidate.totalCopper)}</dd></div>
            <div><dt>{t("Прирост DPS", "DPS gain")}</dt><dd>{signed.format(candidate.comparison.deltaPercent)}%<span className={styles.metricNote}>{signed.format(candidate.comparison.deltaDps)} ± {numeric.format(candidate.comparison.uncertainty.marginDps)} DPS</span></dd></div>
          </dl>
          <button type="button" className={tools.quiet} aria-pressed={selected.key === candidate.key} aria-label={`${t("Выбрать", "Select")}: ${title}`} data-auction-select-comparison={objective} onClick={() => choose(candidate)}>{selected.key === candidate.key ? t("Выбран", "Selected") : t("Выбрать комплект", "Select loadout")}</button>
        </div>;
      })}
    </div> : null}
    {!complete && !exhaustiveEnhancements ? <p className={styles.note}>{selected.significant
      ? t("Рекомендация по проверенным вариантам. Можно продолжить поиск.", "Recommended from the options checked. You can keep searching.")
      : t("Проверена часть вариантов. Можно продолжить поиск.", "Only some options have been checked. You can keep searching.")}</p> : null}
    {complete && limitedEnhancements && selected.kind === "enhanced" ? <p className={styles.note}>{t("Камни и чары выбраны из проверенных сочетаний.", "Gems and enchants were selected from the combinations checked.")}</p> : null}
    {assembly.dataComplete === false ? <p className={styles.note}>{t("Часть предметов не удалось оценить.", "Some items could not be evaluated.")}</p> : null}
    {exhaustiveEnhancements ? <p className={styles.note} data-auction-enhancement-status={stage.status}>
      {!stage.complete ? t("Перебираем комплекты с камнями и чарами. Показан промежуточный результат.", "Checking loadouts with gems and enchants. This result is provisional.")
        : stage.status === "unavailable" ? t("Не хватает данных для сравнения комплектов с камнями и чарами.", "There is insufficient data to compare loadouts with gems and enchants.")
        : stage.status === "no_affordable_configuration" ? t("В пределах бюджета не найдено доступного комплекта с подтверждённой ценой.", "No available loadout with a verified price fits the budget.")
        : t("Перебор доступных комплектов с камнями и чарами завершён.", "Finished checking the available loadouts with gems and enchants.")}
      {stage.equipmentChecked !== undefined ? ` ${t("Обработано комплектов", "Loadouts checked")}: ${numeric.format(stage.equipmentChecked)}.` : ""}
      {stage.complete && stage.reasons?.includes("no_supported_enchant") ? " " + t("Некоторые вещи можно зачаровать, но для них не удалось подтвердить доступные персонажу чары.", "Some items can be enchanted, but no compatible enchant could be verified for this character.") : ""}
      {stage.complete && stage.reasons?.includes("no_supported_gem") ? " " + t("Для части гнёзд в каталоге не нашлось подтверждённого совместимого камня.", "For some sockets the catalog has no verified compatible gem.") : ""}
      {stage.searchLimited && stage.complete && !stage.reasons?.some(reason => reason === "no_supported_enchant" || reason === "no_supported_gem") ? ` ${t("Сравнение охватывает варианты с проверенными свойствами и ценами.", "The comparison covers options with verified properties and prices.")}` : ""}
    </p> : assembly.enhancementMode === "enhanced" ? <p className={styles.note} data-auction-enhancement-status={stage?.status ?? "pending"}>{stage?.status === "unavailable"
      ? t("Не хватает данных для подбора камней и чар. Показаны проверенные вещи.", "Data for gems and enchants is unavailable. Verified gear is shown.")
      : stage?.status === "no_affordable_configuration" ? t("Не найдено проверенного сочетания камней и чар в бюджете. Показан комплект вещей.", "No verified gem and enchant combination was found within budget. The gear loadout is shown.")
      : stage?.status === "ready" ? t("Проверены варианты камней и чар для покупаемых замен; остальная экипировка не меняется.", "Gem and enchant options were checked for purchased replacements; your other gear stays unchanged.")
      : t("Подбор камней и чар ещё не завершён. Показан текущий результат.", "Gem and enchant selection is not complete yet. The current result is shown.")}</p> : null}
    {selected.kind === "items" ? <p className={styles.note}>{exhaustiveEnhancements
      ? t("Для этого варианта достаточно купить вещи.", "This loadout only requires buying the equipment.") : equipmentOnly
      ? t("Подбор только вещей. Камни и чары не включены.", "Equipment selection only. Gems and enchants are not included.")
      : t("Стоимость указана только за вещи. Камни и чары не подобраны.", "The price covers equipment only. Gems and enchants have not been selected.")}</p>
      : !selected.fullyEnhanced ? <p className={styles.note}>{t("Не все доступные камни и чары установлены в этом варианте.", "This option does not fill every available gem and enchant slot.")}</p> : null}
    {selected.kind === "enhanced" && selected.totalCopper === null ? <p className={styles.staleResult}>{t("Полная цена или наличие камней и чар не подтверждены. Проверьте наличие и цены перед покупкой.", "The full price or availability of gems and enchants is unverified. Check availability and prices before buying.")}</p> : null}
    {!selected.significant ? <p role="status" className={tools.status}>{selected.comparison.deltaDps <= 0
      ? t("Этот вариант не улучшает текущую экипировку. Покупка не рекомендована.", "This option does not improve your current gear. Buying is not recommended.")
      : t("Прирост в пределах погрешности. Покупка не рекомендована.", "The gain is within the margin of error. Buying is not recommended.")}</p> : null}
    {selected.purchases.length || selected.enhancement?.configuration.consumables.length ? <AuctionShoppingList key={`${assembly.searchId}:${selected.key}`} characterSlug={characterSlug} snapshotKey={snapshotKey} searchId={assembly.searchId} result={selected} locale={locale} stale={stale} selectionLocked={selectionLocked} onExcludeLot={onExcludeLot} /> : null}
    {selected.removedSlots.includes("OFF_HAND") ? <p className={tools.status}>{t("Левая рука снимается ради двуручного оружия.", "The off-hand is removed for the two-handed weapon.")}</p> : null}
    <details className={styles.disclosure} data-auction-calculation-details><summary>{t("Стоимость и расчёт DPS", "Cost and DPS breakdown")}</summary>
      <div className={styles.resultDetails}>
        <p className={styles.note}>{label(selected)} · {assembly.objective === "value" ? t("Подбор по цене за прирост DPS", "Selected by cost per DPS gain") : t("Подбор по максимуму DPS", "Selected for maximum DPS")}</p>
        <dl className={styles.totals}>
          <div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(assembly.budgetCopper)}</dd></div>
          <div><dt>{t("Предметы", "Equipment")}</dt><dd>{money(selected.itemsCopper)}</dd></div>
          {!equipmentOnly ? <><div><dt>{t("Камни", "Gems")}</dt><dd>{money(selected.gemsCopper)}</dd></div>
          <div><dt>{t("Чары", "Enchants")}</dt><dd>{money(selected.enchantsCopper)}</dd></div></> : null}
          <div><dt>{t("Полная стоимость", "Total cost")}</dt><dd>{money(selected.totalCopper)}</dd></div>
          <div><dt>{t("Останется", "Remaining")}</dt><dd>{money(selected.remainingCopper)}</dd></div>
          {selected.significant && selected.totalCopper !== null ? <div><dt>{t("Цена за +1 DPS", "Cost per +1 DPS")}</dt><dd>{formatGoldRate(selected.totalCopper / selected.comparison.deltaDps, locale)}</dd></div> : null}
        </dl>
        <dl className={styles.dpsMetrics}>
          <div><dt>{t("Сейчас", "Current gear")}</dt><dd>{numeric.format(selected.comparison.baselineDps)} <span>DPS</span></dd></div>
          <div><dt>{t("С этим комплектом", "With this loadout")}</dt><dd>{numeric.format(selected.comparison.candidateDps)} <span>DPS</span></dd></div>
        </dl>
      </div>
    </details>
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
