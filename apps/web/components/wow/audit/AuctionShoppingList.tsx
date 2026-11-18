"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@gildra/atlas-ui/clipboard";
import type { AuctionGearResult } from "@/lib/wow/auctionGearResult";
import { buildAuctionShoppingRows, type CheckedShoppingRow } from "@/lib/wow/auctionShoppingList";
import { auctionShoppingProgressKey, parseAuctionShoppingProgress } from "@/lib/wow/auctionShoppingProgress";
import { GearPlannerItem } from "./GearPlannerItem";
import { auctionFormats, formatGold } from "./auctionFormat";
import { upgradeSlotName } from "./characterUpgradesCopy";
import styles from "./auctionGearOptimizer.module.css";
import tools from "./characterTools.module.css";

type Props = { characterSlug: string; snapshotKey: string; searchId: string; result: AuctionGearResult; locale: "en" | "ru";
  stale: boolean; selectionLocked: boolean; onExcludeLot: (auctionId: number) => void };
type Check = { rows: CheckedShoppingRow[]; remainingCopper: number | null; checkedAt: string; sourceUpdatedAt: string; commoditySourceUpdatedAt: string | null };

export function AuctionShoppingList({ characterSlug, snapshotKey, searchId, result, locale, stale, selectionLocked, onExcludeLot }: Props) {
  const ru = locale === "ru", t = (r: string, e: string) => ru ? r : e;
  const money = (value: number | null) => value === null ? t("Неизвестна", "Unknown") : formatGold(value, locale);
  const rows = useMemo(() => buildAuctionShoppingRows(result.purchases, result.enhancement?.configuration.consumables, result.enhancement?.consumableNames), [result]);
  const storageKey = auctionShoppingProgressKey(characterSlug, snapshotKey, result.key);
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const expiredMessage = t("Проверка цен устарела. Проверьте рынок повторно.", "The price check expired. Check the market again.");
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      try { setPurchased(parseAuctionShoppingProgress(localStorage.getItem(storageKey), rows.map(row => row.key))); }
      catch { /* Storage may be unavailable; this visit still has usable progress. */ }
      setLoaded(true); setCheck(null); setChecking(false);
    });
    return () => { live = false; request.current?.abort(); };
  }, [storageKey, rows, stale]);
  useEffect(() => {
    if (!check) return;
    const expires = Date.parse(check.checkedAt) + 60_000;
    const timer = setTimeout(() => {
      setCheck(null); setMessage(expiredMessage);
    }, Math.max(1, expires - Date.now()));
    return () => clearTimeout(timer);
  }, [check, expiredMessage]);
  const toggle = (key: string, value: boolean) => {
    revision.current++; request.current?.abort(); setChecking(false); setCheck(null); setMessage("");
    const next = new Set(purchased); if (value) next.add(key); else next.delete(key);
    setPurchased(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, purchasedKeys: [...next] })); }
    catch { setMessage(t("Отметки сохранятся только до закрытия страницы.", "Purchase progress will last only until you close this page.")); }
  };
  const copyName = async (name: string) => {
    try { await copyText(name); setMessage(t("Название скопировано.", "Item name copied.")); }
    catch { setMessage(t("Не удалось скопировать название. Выделите его вручную.", "Could not copy the name. Select it manually.")); }
  };
  const recheck = async () => {
    request.current?.abort();
    const controller = new AbortController(), generation = ++revision.current;
    request.current = controller; setChecking(true); setCheck(null); setMessage("");
    try {
      const response = await fetch("/api/wow/auction-shopping-list", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, recommendationKey: result.key, purchasedKeys: [...purchased] }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]) });
      const data = await response.json() as Check & { error?: string };
      if (generation !== revision.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? "shopping_market_unavailable");
      if (!Number.isFinite(Date.parse(data.checkedAt)) || Date.now() - Date.parse(data.checkedAt) > 60_000 ||
        !Array.isArray(data.rows) || data.rows.length !== rows.length || rows.some(row => !data.rows.some(current => current.key === row.key && current.itemId === row.itemId && current.quantity === row.quantity && current.variantKey === row.variantKey))) throw new Error("shopping_market_unavailable");
      setCheck(data); setMessage(t("Наличие и цены оставшихся покупок проверены.", "Availability and prices of remaining purchases checked."));
    } catch (error) {
      if (generation !== revision.current || controller.signal.aborted) return;
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "session_expired" ? t("Войдите в Battle.net повторно для проверки цен.", "Sign in to Battle.net again to check prices.")
        : ["search_not_found", "recommendation_not_found", "character_not_found", "auction_market_changed"].includes(code)
          ? t("Этот комплект больше нельзя проверить. Запустите новый поиск.", "This loadout can no longer be checked. Start a new search.")
          : t("Не удалось проверить рынок. Старые цены не подтверждены; повторите проверку.", "Could not check the market. Previous prices are unverified; try again."));
    } finally {
      if (generation === revision.current) { setChecking(false); request.current = null; }
    }
  };
  const remaining = rows.filter(row => !purchased.has(row.key));
  const quotedRemaining = remaining.some(row => row.quotedCopper === null) ? null : remaining.reduce((sum, row) => sum + row.quotedCopper!, 0);
  const statusText = (status: CheckedShoppingRow["status"]) => ({ purchased: t("Куплено", "Purchased"), available: t("Лот доступен", "Available"),
    repriced: t("Цена изменилась", "Price changed"), missing: t("Больше нет в продаже", "No longer available"),
    changed: t("Лот изменился — не заменяем автоматически", "Lot changed — no automatic substitution"), unverified: t("Наличие не подтверждено", "Availability unverified") })[status];

  return <div className={styles.result} data-auction-shopping-list>
    <h4 className={tools.subtitle}>{result.significant && result.totalCopper !== null && !stale ? t("Что купить", "Items to buy") : t("Состав выбранного комплекта", "Selected loadout contents")}</h4>
    {result.significant ? <button type="button" className={tools.quiet} aria-busy={checking || undefined} disabled={!loaded} onClick={() => void recheck()}>{checking ? t("Проверяем рынок…", "Checking market…") : t("Проверить наличие и цены", "Check availability and prices")}</button> : null}
    <ul className={styles.lots}>{rows.map(row => {
      const item = row.kind === "item" ? result.purchases.find(item => item.auctionId === row.auctionId) : null;
      const name = row.name || (row.kind === "gem" ? t("Камень", "Gem") : t("Чары", "Enchant"));
      const checked = check?.rows.find(current => current.key === row.key);
      return <li className={styles.lot} key={row.key} data-auction-shopping-row data-purchased={purchased.has(row.key) || undefined}>
        <div className={styles.lotHeader}><div className={styles.purchase}>{item ? <GearPlannerItem item={item} locale={locale} /> : <strong>{name}</strong>}</div>
          <div className={styles.price}><strong>{money(checked && !purchased.has(row.key) ? checked.currentCopper : row.quotedCopper)}</strong>{row.quantity > 1 ? <span>× {auctionFormats[locale].numeric.format(row.quantity)}</span> : null}</div></div>
        <div className={tools.actions}><label className={styles.include}><input type="checkbox" checked={purchased.has(row.key)} aria-label={`${t("Куплено", "Purchased")}: ${name}`} disabled={!loaded} onChange={event => toggle(row.key, event.target.checked)} /><span>{t("Куплено", "Purchased")}</span></label>
          {row.name ? <button type="button" className={tools.quiet} onClick={() => void copyName(row.name)} aria-label={`${t("Скопировать название", "Copy name")}: ${name}`}>{t("Скопировать название", "Copy name")}</button> : null}
          {item ? <button type="button" className={tools.quiet} disabled={selectionLocked} onClick={() => onExcludeLot(item.auctionId)} aria-label={`${t("Исключить лот из сборки", "Exclude lot from loadout")}: ${name}`}>{t("Исключить лот", "Exclude lot")}</button> : null}</div>
        {checked ? <p className={styles.note} data-shopping-status={checked.status}>{statusText(checked.status)}</p> : null}
        {item ? <ul className={styles.replacements}>{result.purchases.filter(purchase => purchase.auctionId === item.auctionId).map(purchase => {
          const configuration = result.enhancement?.configuration.slots.find(slot => slot.slotType === purchase.slotType);
          const gems = configuration?.gemIds.filter(id => id > 0).map(id => result.enhancement?.enhancementNames?.gems[id] ?? t("Камень", "Gem")) ?? [];
          const enchant = configuration?.enchantId ? result.enhancement?.enhancementNames?.enchants[configuration.enchantId] ?? t("Чары", "Enchant") : null;
          return <li key={purchase.slotType} data-auction-enhanced-slot><span className={styles.replacementLabel}>{upgradeSlotName(purchase.slotType, ru)}</span>{purchase.currentItem ? <GearPlannerItem item={purchase.currentItem} locale={locale} /> : null}
            {gems.length ? <span className={styles.note}>{t("Камни", "Gems")}: {gems.join(" · ")}</span> : null}{enchant ? <span className={styles.note}>{t("Чары", "Enchants")}: {enchant}</span> : null}</li>;
        })}</ul> : null}
      </li>;
    })}</ul>
    {result.enhancement?.configuration.ownedChanges?.length ? <div data-auction-owned-upgrades>
      <h5 className={tools.subtitle}>{t("Улучшить надетые вещи", "Upgrade equipped items")}</h5>
      <ul className={styles.replacements}>{result.enhancement.configuration.ownedChanges.map(change => <li key={change.slotType}>
        <strong>{upgradeSlotName(change.slotType, ru)}</strong>
        {change.gems.map(gem => <span className={styles.note} key={gem.index}>{t("Гнездо", "Socket")} {gem.index + 1} · {result.enhancement?.enhancementNames?.gems[gem.itemId] ?? t("Камень", "Gem")}</span>)}
        {change.enchantId ? <span className={styles.note}>{t("Чары", "Enchant")} · {result.enhancement?.enhancementNames?.enchants[change.enchantId] ?? t("Постоянные чары", "Permanent enchant")}</span> : null}
      </li>)}</ul>
    </div> : null}
    <dl className={styles.totals}><div><dt>{check ? t("Осталось купить по проверенным ценам", "Remaining at checked prices") : t("Осталось купить по прежним ценам", "Remaining at previous prices")}</dt><dd>{money(check ? check.remainingCopper : quotedRemaining)}</dd></div></dl>
    {check ? <p className={styles.note}>{t("Проверено", "Checked")}: {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(check.checkedAt))}</p> : null}
    {result.totalCopper === null ? <p className={styles.note}>{t("Сумма относится только к перечисленным покупкам. Полная стоимость комплекта неизвестна.", "This total covers only the listed purchases. Full loadout cost is unknown.")}</p> : null}
    {message ? <p role="status" className={styles.note}>{message}</p> : null}
  </div>;
}
