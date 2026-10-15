"use client";

import { useEffect, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import styles from "./auctionGearOptimizer.module.css";
const slotNames: Record<string, [string, string]> = {
  HEAD: ["Голова", "Head"],
  NECK: ["Шея", "Neck"],
  SHOULDER: ["Плечи", "Shoulders"],
  CHEST: ["Грудь", "Chest"],
  WAIST: ["Пояс", "Waist"],
  LEGS: ["Ноги", "Legs"],
  FEET: ["Ступни", "Feet"],
  WRIST: ["Запястья", "Wrists"],
  HANDS: ["Кисти рук", "Hands"],
  BACK: ["Спина", "Back"],
  FINGER_1: ["Кольцо 1", "Ring 1"],
  FINGER_2: ["Кольцо 2", "Ring 2"],
  TRINKET_1: ["Аксессуар 1", "Trinket 1"],
  TRINKET_2: ["Аксессуар 2", "Trinket 2"],
  MAIN_HAND: ["Правая рука", "Main hand"],
  OFF_HAND: ["Левая рука", "Off hand"]
};
export function AuctionGearOptimizer({
  characterSlug,
  snapshotKey,
  specializationSlug,
  localePrefix = "/ru"
}: {
  characterSlug: string;
  snapshotKey: string;
  specializationSlug: string;
  localePrefix?: "" | "/ru";
}) {
  const ru = localePrefix === "/ru",
    t = (r: string, e: string) => ru ? r : e;
  const [budget, setBudget] = useState("10000"),
    [scenario, setScenario] = useState("single-target");
  const [job, setJob] = useState<AuctionGearJob | null>(null),
    [error, setError] = useState(""),
    [starting, setStarting] = useState(false);
  const active = useRef<{
    controller: AbortController;
    id?: string;
  } | null>(null);
  const theme = getTalentSpecTheme(specializationSlug),
    supported = theme && ["melee", "ranged"].includes(theme.role);
  const money = (copper: number) => new Intl.NumberFormat(ru ? "ru-RU" : "en-US", {
    maximumFractionDigits: 4
  }).format(copper / 10000);
  const number = (value: number) => new Intl.NumberFormat(ru ? "ru-RU" : "en-US", {
    maximumFractionDigits: 2
  }).format(value);
  useEffect(() => () => {
    const current = active.current;
    current?.controller.abort();
    if (current?.id) void fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(current.id)}`, {
      method: "DELETE",
      keepalive: true
    });
  }, [characterSlug, snapshotKey]);
  const running = starting || job?.status === "queued" || job?.status === "running";
  async function start() {
    try {
      goldToCopper(budget);
    } catch {
      setError("invalid_budget");
      return;
    }
    const request = {
      controller: new AbortController(),
      id: undefined as string | undefined
    };
    active.current?.controller.abort();
    active.current = request;
    setStarting(true);
    setError("");
    setJob(null);
    try {
      let response = await fetch("/api/wow/auction-gear-plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          characterSlug,
          budgetGold: budget,
          scenario,
          locale: ru ? "ru" : "en"
        }),
        signal: request.controller.signal
      });
      let payload = (await response.json()) as AuctionGearJob & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "auction_plan_unavailable");
      request.id = payload.id;
      while (!request.controller.signal.aborted) {
        if (active.current !== request) return;
        setStarting(false);
        setJob(payload);
        if (!["queued", "running"].includes(payload.status)) break;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            request.controller.signal.removeEventListener("abort", abort);
            resolve();
          }, 1500);
          function abort() {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          }
          request.controller.signal.addEventListener("abort", abort, {
            once: true
          });
        });
        response = await fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(request.id!)}`, {
          cache: "no-store",
          signal: request.controller.signal
        });
        payload = (await response.json()) as AuctionGearJob & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "auction_plan_unavailable");
      }
    } catch (reason) {
      if (!request.controller.signal.aborted && active.current === request) setError(reason instanceof Error ? reason.message : "auction_plan_unavailable");
    } finally {
      if (active.current === request) setStarting(false);
    }
  }
  async function cancel() {
    const current = active.current;
    current?.controller.abort();
    setStarting(false);
    setJob(j => j ? {
      ...j,
      status: "cancelled"
    } : null);
    if (current?.id) await fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(current.id)}`, {
      method: "DELETE"
    }).catch(() => undefined);
  }
  const messages: Record<string, string> = {
    invalid_budget: t("Введите сумму в золоте: от 0, не более четырёх знаков после запятой.", "Enter a gold budget of 0 or more, with up to four decimal places."),
    session_expired: t("Войдите в Battle.net повторно.", "Sign in to Battle.net again."),
    market_stale: t("Снимок аукциона устарел. Повторите подбор после обновления рынка.", "The auction snapshot is too old. Retry after the market updates."),
    market_timestamp_unverified: t("Не удалось подтвердить время обновления аукциона.", "The auction update time could not be verified."),
    equipment_constraints_unverified: t("В каталоге не хватает данных об ограничениях надетых вещей.", "The catalog is missing constraints for your equipped items."),
    damage_specialization_required: t("Подбор DPS доступен для специализаций, наносящих урон.", "DPS optimization is available for damage specializations."),
    plan_already_running: t("Предыдущий подбор ещё выполняется.", "Your previous search is still running."),
    plan_rate_limited: t("Слишком много запусков. Подождите минуту.", "Too many searches. Wait a minute."),
    simulation_unavailable: t("Сервис SimulationCraft сейчас недоступен. Повторите позже.", "SimulationCraft is unavailable. Try again later."),
    variant_metadata_worker_upgrade_required: t("Для проверки вариантов нужно обновить worker SimulationCraft.", "The SimulationCraft worker must be updated to verify item variants."),
    variant_resolution_unavailable: t("Не удалось проверить свойства аукционных вещей. Повторите позже.", "Auction item properties could not be verified. Try again later."),
    item_reference_unavailable: t("Не удалось получить контрольные данные вещей от Blizzard. Повторите позже.", "Blizzard item reference data could not be loaded. Try again later."),
    plan_not_found: t("Расчёт больше недоступен. Запустите подбор повторно.", "The search has expired. Start a new search.")
  };
  const failure = error || (job?.status === "failed" ? job.error : "");
  const result = job?.status === "completed" ? job.result : null;
  const lots = result ? [...new Map(result.purchases.map(p => [p.auctionId, p])).values()] : [];
  const phase = job?.progress?.phase;
  return <section className={styles.panel} aria-labelledby="auction-gear-title" data-auction-gear>
    <header><small>{t("АУКЦИОН СЕРВЕРА", "REALM AUCTION HOUSE")}</small><h2 id="auction-gear-title">{t("Подобрать шмот под бюджет", "Find gear within your budget")}</h2><p>{t("Сравним комплекты с текущей экипировкой и составим список покупок с доказанным приростом DPS.", "Compare loadouts against your equipped gear and get a shopping list with a measured DPS improvement.")}</p></header>
    {!supported ? <p>{messages.damage_specialization_required}</p> : <form className={styles.controls} onSubmit={e => {
      e.preventDefault();
      void start();
    }}>
      <label>{t("Бюджет, золото", "Budget, gold")}<input name="budgetGold" inputMode="decimal" value={budget} onChange={e => {
          setBudget(e.target.value);
          setJob(null);
          setError("");
        }} disabled={running} required aria-describedby="auction-budget-help" /></label>
      <label>{t("Сценарий", "Encounter")}<select value={scenario} onChange={e => {
          setScenario(e.target.value);
          setJob(null);
        }} disabled={running}><option value="single-target">{t("Одна цель · 120 секунд", "Single target · 120 seconds")}</option><option value="aoe">{t("5 целей · 60 секунд", "5 targets · 60 seconds")}</option><option value="execute">{t("Короткий бой · 90 секунд", "Short fight · 90 seconds")}</option></select></label>
      <button type="submit" disabled={running}>{running ? t("Подбираем…", "Searching…") : t("Подобрать с аукциона", "Find auction gear")}</button>
      {running ? <button type="button" onClick={() => void cancel()}>{t("Отменить", "Cancel")}</button> : null}
    </form>}
    <p id="auction-budget-help" className={styles.note}>{t("Цена включает покупку целых лотов. Зачарования и камни не включены. Покупки не совершаются автоматически.", "Prices cover whole auction lots. Enchants and gems are excluded. Purchases are never automatic.")}</p>
    {running ? <p role="status">{phase === "market" ? t("Загружаем рынок сервера…", "Loading your realm market…") : phase === "catalog" ? t("Проверяем варианты и совместимость…", "Checking variants and compatibility…") : phase === "variants" ? `${t("Проверяем свойства вариантов", "Resolving item properties")}: ${job?.progress?.completed} / ${job?.progress?.total}` : phase === "simulating" ? `${t("Сравниваем комплекты", "Comparing loadouts")}: ${job?.progress?.completed} / ${job?.progress?.total}` : t("Ожидаем расчёта…", "Waiting for the search…")}</p> : null}
    {failure ? <p role="alert">{messages[failure] ?? t("Не удалось завершить подбор. Повторите позже.", "The search could not finish. Try again later.")}</p> : null}
    {job?.status === "cancelled" ? <p role="status">{t("Подбор отменён.", "Search cancelled.")}</p> : null}
    {result ? <div className={styles.result}>
      <p>{result.market.region.toUpperCase()} · {result.market.realm} · {t("Рынок обновлён", "Market updated")} <time dateTime={new Date(result.market.updatedAt).toISOString()}>{new Date(result.market.updatedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</time></p>
      <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(result.budgetCopper)} {t("зол.", "gold")}</dd></div><div><dt>{t("Потратить", "Spend")}</dt><dd>{money(result.spentCopper)} {t("зол.", "gold")}</dd></div><div><dt>{t("Останется", "Remaining")}</dt><dd>{money(result.remainingCopper)} {t("зол.", "gold")}</dd></div></dl>
      {result.purchases.length ? <><h3>{t("Лучший проверенный комплект", "Best tested loadout")}</h3><p>{number(result.comparison.baselineDps)} → {number(result.comparison.candidateDps)} DPS · +{number(result.comparison.deltaPercent)}% ±{number(result.comparison.uncertainty.marginPercent)}%</p>
      <ul className={styles.lots}>{lots.map(lot => <li key={lot.auctionId}><div><strong>{lot.name}</strong><span>{lot.itemLevel} {t("ур.", "ilvl")}</span><span>{result.purchases.filter(p => p.auctionId === lot.auctionId).map(p => slotNames[p.slotType]?.[ru ? 0 : 1] ?? p.slotType).join(" / ")}</span>{lot.bonusIds ? <details><summary>{t("Вариант лота", "Auction variant")}</summary><p>{t("Требует уровень", "Requires level")} {lot.requiredLevel} · Bonus IDs: {lot.bonusIds.join(" / ") || "—"} · Context: {lot.contextId ?? 0}</p>{lot.modifiers?.length ? <p>{t("Модификаторы", "Modifiers")}: {lot.modifiers.map(m => `${m.type}=${m.value}`).join(", ")}</p> : null}</details> : null}</div><div><strong>{money(lot.lotCostCopper)} {t("зол.", "gold")}</strong><span>{t("Лот", "Auction")} #{lot.auctionId} · {lot.quantity} {t("шт.", "items")}</span></div></li>)}</ul></> : <p role="status">{result.optionsConsidered ? t("В проверенных вариантах нет улучшения выше погрешности. Покупки не рекомендуем.", "None of the tested options improved DPS beyond uncertainty. No purchases recommended.") : t("Под этот бюджет нет подходящих лотов с точно подтверждённым вариантом вещи.", "No compatible lots with an exactly verified item variant were found within this budget.")}</p>}
      {result.removedSlots.includes("OFF_HAND") ? <p>{t("Для двуручного оружия предмет из левой руки снимается.", "The off-hand item is removed to equip the two-handed weapon.")}</p> : null}
      <p className={styles.note}>{result.searchLimited ? t("Поиск ограничен: это лучший из проверенных комплектов, оптимальность среди всего рынка не гарантируется.", "Search was bounded: this is the best tested loadout; a market-wide optimum is not guaranteed.") : t("Показаны результаты проверенных комплектов.", "Showing the tested loadout results.")} {t("Лоты могут быть выкуплены другими игроками. Перед покупкой проверьте цену и вариант вещи.", "Lots can sell to other players. Check the price and item variant before buying.")}</p>
      <details><summary>{t("Данные расчёта", "Calculation details")}</summary><p>{result.engine} · {result.simulations} {t("расчётов", "simulations")} · {result.coverage.matchedLots} / {result.coverage.affordableLots} {t("лотов сопоставлено; лоты с неподдерживаемыми модификаторами исключены.", "lots matched; unsupported item modifiers are excluded.")}</p></details>
    </div> : null}
  </section>;
}
