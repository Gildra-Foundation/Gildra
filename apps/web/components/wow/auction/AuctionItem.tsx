"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Package } from "lucide-react";
import { AtlasTooltip } from "@gildra/atlas-ui/AtlasTooltip";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import type { AuctionResult, AuctionRegion } from "@/lib/wow/auctionBrowser";
import type { ExactAuctionTooltip } from "@/lib/wow/auctionExactTooltip";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { AuctionMoney } from "./AuctionMoney";
import { auctionCopy } from "./auctionCopy";
import styles from "./auction.module.css";

type Row = AuctionResult["rows"][number];
const requests = new Map<string, { expires: number; promise: Promise<ExactAuctionTooltip> }>();
function exactRequest(url: string) {
  const entry = requests.get(url);
  if (entry && entry.expires > Date.now()) return entry.promise;
  if (requests.size >= 80) requests.delete(requests.keys().next().value!);
  const promise = fetch(url, { signal: AbortSignal.timeout(15000) }).then(async response => {
    if (!response.ok) throw new Error("item_details_unavailable");
    return await response.json() as ExactAuctionTooltip;
  }).catch(error => { requests.delete(url); throw error; });
  requests.set(url, { expires: Date.now() + 15 * 60_000, promise });
  return promise;
}
function NativeFacts({ exact, lang }: { exact: ExactAuctionTooltip; lang: "ru" | "en" }) {
  const c = auctionCopy[lang], number = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 2 });
  return <>
    <span>{c.itemLevel}: {exact.itemLevel}</span>
    {exact.requiredLevel > 0 ? <span>{c.requiresLevel}: {exact.requiredLevel}</span> : null}
    {exact.weapon ? <><span>{c.damage}: {number(exact.weapon.minDamage)}–{number(exact.weapon.maxDamage)}</span><span>{c.weaponSpeed}: {number(exact.weapon.speedSeconds)}</span><span>{c.weaponDps}: {number(exact.weapon.dps)}</span></> : null}
    <ul>{Object.entries(exact.stats).filter(([, value]) => value > 0).map(([key, value]) => <li key={key}>{number(value)} {c.statNames[key as keyof typeof c.statNames] ?? key}</li>)}</ul>
  </>;
}
function GameTooltipLines({ lines }: { lines: string[] }) {
  const occurrences = new Map<string, number>();
  return <div className={styles.wowLines}>{lines.map(line => {
    const occurrence = occurrences.get(line) ?? 0; occurrences.set(line, occurrence + 1);
    return <p key={`${line}:${occurrence}`} data-stat={/^\+/.test(line) || undefined}>{line}</p>;
  })}</div>;
}
function ItemDescription({ row, lang, exact, status }: { row: Row; lang: "ru" | "en"; exact: ExactAuctionTooltip | null; status: string }) {
  const c = auctionCopy[lang], item = row.item;
  if (row.petSpeciesId) return <p>{c.pet} {row.petSpeciesId}{row.petLevel ? ` · ${c.petLevel} ${row.petLevel}` : ""}</p>;
  const gear = item?.itemClassId === 2 || item?.itemClassId === 4 || Boolean(item?.stats.length || item?.weapon.length);
  if (gear) {
    if (!exact) return <p role="status">{status === "loading" ? c.loadingItem : c.exactUnavailable}</p>;
    return exact.lines ? <GameTooltipLines lines={exact.lines} /> : <NativeFacts exact={exact} lang={lang} />;
  }
  if (!item) return <p>{c.itemUnavailable}</p>;
  return <>{item.binding ? <span>{item.binding}</span> : null}{item.description ? <p>{item.description}</p> : null}{[...new Set(item.effects)].map(line => <p key={line}>{line}</p>)}</>;
}
function LotPrices({ row, lang }: { row: Row; lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  return <dl className={styles.tooltipPrices}>
      <div><dt>{c.quantity}</dt><dd>{row.quantity.toLocaleString(lang)}</dd></div>
      <div><dt>{c.unit}</dt><dd>{row.unitPrice === null ? c.noBuyout : <AuctionMoney value={row.unitPrice} lang={lang} />}</dd></div>
      {row.buyout !== null ? <div><dt>{c.buyout}</dt><dd><AuctionMoney value={row.buyout} lang={lang} /></dd></div> : null}
      {row.bid !== null ? <div><dt>{c.bid}</dt><dd><AuctionMoney value={row.bid} lang={lang} /></dd></div> : null}
    </dl>;
}
function ItemFacts({ row, lang, exact, status }: { row: Row; lang: "ru" | "en"; exact: ExactAuctionTooltip | null; status: string }) {
  const c = auctionCopy[lang];
  return <div className={styles.itemFacts}>
    <strong>{exact?.name ?? row.name ?? `ID ${row.itemId}`}</strong>
    <span>{exact ? c.qualities[exact.quality] : row.item?.quality}</span>
    <ItemDescription row={row} lang={lang} exact={exact} status={status} />
    <LotPrices row={row} lang={lang} />
    <small>{exact?.lines ? c.exactSource : c.itemSource} · #{row.id}</small>
  </div>;
}

export function AuctionItem({ row, lang, region, realm, market }: { row: Row; lang: "ru" | "en"; region: AuctionRegion; realm: string; market: "realm" | "commodities" }) {
  const c = auctionCopy[lang], [open, setOpen] = useState(false), [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [exact, setExact] = useState<ExactAuctionTooltip | null>(null), [status, setStatus] = useState("idle");
  const gear = !row.petSpeciesId && (row.item?.itemClassId === 2 || row.item?.itemClassId === 4 || Boolean(row.item?.stats.length || row.item?.weapon.length));
  const load = async () => {
    if (!gear || status === "loading" || status === "ready") return;
    setStatus("loading");
    try { setExact(await exactRequest(`/api/wow/auction?${new URLSearchParams({ action: "tooltip", region, realm, market, lang, auctionId: String(row.id) })}`)); setStatus("ready"); }
    catch { setStatus("error"); }
  };
  const quality = exact?.quality ?? row.item?.qualityId;
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  const qualityStyle = palette ? { "--auction-quality": palette.frame, "--auction-quality-text": palette.text } as CSSProperties : undefined;
  const name = exact?.name ?? row.name ?? `ID ${row.itemId}`;
  const reference = new URL(`https://www.wowhead.com/${lang === "ru" ? "ru/" : ""}item=${row.itemId}`);
  if (row.bonusIds.length) reference.searchParams.set("bonus", row.bonusIds.join(":"));
  const facts = <ItemFacts row={row} lang={lang} exact={exact} status={status} />;
  return <>
    <AtlasTooltip content={open ? null : <div className={styles.itemPreview} style={qualityStyle}>{facts}<p className={styles.secondary}>{c.openItem}</p></div>}>
      <button type="button" className={styles.itemTrigger} style={qualityStyle} aria-haspopup="dialog" aria-expanded={open} aria-label={`${name}. ${c.openItem}`} onPointerEnter={() => void load()} onFocus={() => void load()} onClick={() => { void load(); setOpen(true); }}>
        <span className={styles.itemIcon} aria-hidden="true">{row.item?.iconUrl && failedUrl !== row.item.iconUrl ? <Image src={row.item.iconUrl} alt="" width={40} height={40} unoptimized onError={() => setFailedUrl(row.item?.iconUrl ?? null)} /> : <Package size={22} />}</span>
        <span>{name}{exact ? <small className={styles.itemLevel}>{c.itemLevel} {exact.itemLevel}</small> : null}</span>
      </button>
    </AtlasTooltip>
    <AtlasDialog open={open} onClose={() => setOpen(false)} label={name} className={styles.itemDialog}>
      <div className={styles.itemDialogContent} style={qualityStyle}>
        {facts}
        <div className={styles.itemActions}><a href={exact?.wowheadUrl ?? reference.href} target="_blank" rel="noreferrer">{c.wowhead}</a>{gear && status === "error" ? <AtlasButton onClick={() => void load()}>{c.retry}</AtlasButton> : null}<AtlasButton onClick={() => setOpen(false)}>{c.closeItem}</AtlasButton></div>
      </div>
    </AtlasDialog>
  </>;
}
