"use client";

import { useEffect, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { GearPlannerItem } from "./GearPlannerItem";
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
function removeAuctionJob(id: string) {
  return fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(id)}`, {
    method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000)
  }).catch(() => undefined);
}
type Props = {
  characterSlug: string;
  snapshotKey: string;
  specializationSlug: string;
  localePrefix?: "" | "/ru";
};
export function AuctionGearOptimizer(props: Props) {
  return <AuctionGearOptimizerContent key={`${props.characterSlug}:${props.snapshotKey}:${props.specializationSlug}:${props.localePrefix ?? "/ru"}`} {...props} />;
}
function AuctionGearOptimizerContent({
  characterSlug,
  snapshotKey,
  specializationSlug,
  localePrefix = "/ru"
}: Props) {
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
    active.current = null;
    current?.controller.abort();
    if (current?.id) void removeAuctionJob(current.id);
  }, [characterSlug, snapshotKey]);
  const running = starting || job?.status === "queued" || job?.status === "running";
  async function start() {
    if (active.current) return;
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
        // Keep receiving the created ID if cancellation happens during POST.
        signal: AbortSignal.timeout(30_000)
      });
      let payload = (await response.json()) as AuctionGearJob & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "auction_plan_unavailable");
      request.id = payload.id;
      if (request.controller.signal.aborted || active.current !== request) {
        void removeAuctionJob(payload.id);
        return;
      }
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
      if (!request.controller.signal.aborted && active.current === request) {
        if (request.id) await removeAuctionJob(request.id);
        if (!request.controller.signal.aborted && active.current === request) {
          const message = reason instanceof Error ? reason.message : "auction_plan_unavailable";
          setError(message);
          setJob({ id: request.id ?? "", status: "failed", progress: null, result: null, error: message });
        }
      }
    } finally {
      if (active.current === request) {
        active.current = null;
        setStarting(false);
      }
    }
  }
  async function cancel() {
    const current = active.current;
    active.current = null;
    current?.controller.abort();
    setStarting(false);
    setError("");
    setJob({ id: current?.id ?? "", status: "cancelled", progress: null, result: null, error: null });
    if (current?.id) await removeAuctionJob(current.id);
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
    variant_metadata_worker_upgrade_required: t("Проверка характеристик вещей сейчас недоступна. Повторите позже.", "Item property verification is unavailable. Try again later."),
    variant_resolution_unavailable: t("Не удалось проверить свойства аукционных вещей. Повторите позже.", "Auction item properties could not be verified. Try again later."),
    item_reference_unavailable: t("Не удалось получить контрольные данные вещей от Blizzard. Повторите позже.", "Blizzard item reference data could not be loaded. Try again later."),
    plan_not_found: t("Расчёт больше недоступен. Запустите подбор повторно.", "The search has expired. Start a new search.")
  };
  const failure = error || (job?.status === "failed" ? job.error : "");
  const result = job?.status === "completed" ? job.result : null;
  const lots = result ? [...new Map(result.purchases.map(p => [p.auctionId, p])).values()] : [];
  const itemLocale = ru ? "ru" : "en";
  const phase = job?.progress?.phase;
  return <section className={styles.panel} aria-labelledby="auction-gear-title" data-auction-gear>
    <header><small>{t("АУКЦИОН СЕРВЕРА", "REALM AUCTION HOUSE")}</small><h2 id="auction-gear-title">{t("Подобрать шмот под бюджет", "Find gear within your budget")}</h2><p>{t("Покажем, что купить, сколько это стоит и какие надетые вещи заменить. Сравним урон всего комплекта с вашей текущей экипировкой.", "See what to buy, what it costs and which equipped items to replace. We compare the whole loadout against your current gear.")}</p></header>
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
    <p id="auction-budget-help" className={styles.note}>{t("Бюджет — максимальная сумма покупок в золоте. Цена считается за целый лот. Зачарования и камни не включены; покупки вы совершаете сами.", "The budget is your maximum spend in gold. Prices cover whole lots. Enchants and gems are excluded; you make the purchases yourself.")}</p>
    {running ? <p role="status">{phase === "market" ? t("Загружаем рынок сервера…", "Loading your realm market…") : phase === "catalog" ? t("Проверяем варианты и совместимость…", "Checking variants and compatibility…") : phase === "variants" ? `${t("Проверяем свойства вариантов", "Resolving item properties")}: ${job?.progress?.completed} / ${job?.progress?.total}` : phase === "simulating" ? `${t("Сравниваем комплекты", "Comparing loadouts")}: ${job?.progress?.completed} / ${job?.progress?.total}` : t("Ожидаем расчёта…", "Waiting for the search…")}</p> : null}
    {failure ? <p role="alert">{messages[failure] ?? t("Не удалось завершить подбор. Повторите позже.", "The search could not finish. Try again later.")}</p> : null}
    {job?.status === "cancelled" ? <p role="status">{t("Подбор отменён.", "Search cancelled.")}</p> : null}
    {result ? <div className={styles.result}>
      <p className={styles.market}>{result.market.region.toUpperCase()} · {result.market.realm} · {t("Рынок обновлён", "Market updated")} <time dateTime={new Date(result.market.updatedAt).toISOString()}>{new Date(result.market.updatedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</time></p>
      <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(result.budgetCopper)} {t("зол.", "gold")}</dd></div><div><dt>{t("Потратить", "Spend")}</dt><dd>{money(result.spentCopper)} {t("зол.", "gold")}</dd></div><div><dt>{t("Останется", "Remaining")}</dt><dd>{money(result.remainingCopper)} {t("зол.", "gold")}</dd></div></dl>
      {result.purchases.length ? <>
        <div className={styles.performance}>
          <h3>{t("Что дадут покупки", "What the purchases improve")}</h3>
          <dl className={styles.dpsMetrics}>
            <div><dt>{t("Сейчас", "Current gear")}</dt><dd>{number(result.comparison.baselineDps)} <span>DPS</span></dd></div>
            <div><dt>{t("С новым комплектом", "With the new loadout")}</dt><dd>{number(result.comparison.candidateDps)} <span>DPS</span></dd></div>
            <div className={styles.gain}><dt>{t("Прирост всего комплекта", "Whole-loadout gain")}</dt><dd>+{number(result.comparison.deltaDps)} <span>DPS · +{number(result.comparison.deltaPercent)}%</span></dd></div>
          </dl>
          <p className={styles.note}>{t("DPS — средний урон в секунду в выбранном бою по результату симуляции.", "DPS means average damage per second in the selected simulated fight.")} {t("Погрешность сравнения", "Comparison uncertainty")}: ±{number(result.comparison.uncertainty.marginPercent)}% {t("при доверительной вероятности 95%. Прирост комплекта превышает эту погрешность.", "at 95% confidence. The loadout gain exceeds this uncertainty.")}</p>
        </div>
        <h3>{t("Что купить и заменить", "What to buy and replace")}</h3>
        <p className={styles.note}>{t("Наведите на предмет или нажмите на него, чтобы посмотреть характеристики.", "Hover over an item or select it to see its properties.")}</p>
        <ul className={styles.lots}>{lots.map(lot => {
          const replacements = result.purchases.filter(purchase => purchase.auctionId === lot.auctionId);
          return <li className={styles.lot} key={lot.auctionId}>
            <div className={styles.lotHeader}>
              <div className={styles.purchase}><span className={styles.label}>{t("Купить", "Buy")}</span><GearPlannerItem item={lot} locale={itemLocale} /></div>
              <div className={styles.price}><span className={styles.label}>{t("Цена всего лота", "Whole-lot price")}</span><strong>{money(lot.lotCostCopper)} {t("зол.", "gold")}</strong><span>{t("Количество в лоте", "Lot quantity")}: {lot.quantity}</span></div>
            </div>
            <ul className={styles.replacements}>{replacements.map(purchase => <li key={purchase.slotType}>
              <div className={styles.replacementLabel}><strong>{slotNames[purchase.slotType]?.[ru ? 0 : 1] ?? purchase.slotType}</strong><span>{t("Заменить надетый предмет", "Replace equipped item")}</span></div>
              {purchase.currentItem ? <GearPlannerItem item={purchase.currentItem} locale={itemLocale} /> : <p className={styles.note}>{t("Данные надетого предмета не сохранены в этом расчёте. Повторите подбор, чтобы сравнить вещи.", "Equipped item details were not saved with this result. Run a new search to compare the items.")}</p>}
            </li>)}</ul>
            {lot.quantity > 1 ? <p className={styles.note}>{t(`В комплекте используются ${replacements.length} из ${lot.quantity} шт. Цена целого лота учтена один раз.`, `The loadout uses ${replacements.length} of ${lot.quantity} items. The whole lot is charged once.`)}</p> : null}
          </li>;
        })}</ul>
      </> : <div className={styles.empty} role="status"><h3>{t("Покупки не рекомендуем", "No purchases recommended")}</h3><p>{result.optionsConsidered ? t("Ни один проверенный комплект не улучшил урон выше погрешности. Оставьте текущую экипировку.", "None of the tested loadouts improved damage beyond uncertainty. Keep your current gear.") : t("В пределах бюджета не найдено подходящих вещей с проверенными характеристиками.", "No suitable items with verified properties were found within your budget.")}</p><p className={styles.note}>{t("Текущий расчётный урон", "Current simulated damage")}: {number(result.comparison.baselineDps)} DPS. {t("DPS — средний урон в секунду в выбранном бою.", "DPS means average damage per second in the selected fight.")}</p></div>}
      {result.removedSlots.includes("OFF_HAND") ? <p>{t("Для двуручного оружия предмет из левой руки снимается.", "The off-hand item is removed to equip the two-handed weapon.")}</p> : null}
      <p className={styles.note}>{result.searchLimited ? t("Проверено ограниченное число комплектов. Более выгодные покупки могут остаться за пределами поиска.", "A limited number of loadouts were tested. Better-value purchases may remain outside the search.") : t("Показаны результаты проверенных комплектов.", "Showing the tested loadout results.")} {result.purchases.length ? t("Лоты могут выкупить другие игроки. Перед покупкой сверьте цену, уровень предмета и характеристики.", "Other players can buy these lots. Check the price, item level and properties before purchasing.") : ""}</p>
      <details className={styles.calculation}><summary>{t("Как получен результат", "How this result was calculated")}</summary><p>{t("Расчётов экипировки", "Loadout simulations")}: {result.simulations}. {t("Вариантов для подбора", "Options considered")}: {result.optionsConsidered}.</p><p>{t("Лотов с проверенными свойствами", "Lots with verified properties")}: {result.coverage.matchedLots}. {t("Всего лотов в пределах бюджета", "Total lots within budget")}: {result.coverage.affordableLots}.</p><p className={styles.note}>{t("Движок расчёта", "Simulation engine")}: {result.engine}</p></details>
    </div> : null}
  </section>;
}
