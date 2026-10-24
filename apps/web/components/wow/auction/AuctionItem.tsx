"use client";
import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";
import { AtlasTooltip } from "@gildra/atlas-ui/AtlasTooltip";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import type { AuctionResult } from "@/lib/wow/auctionBrowser";
import { auctionPreviewMatches } from "@/lib/wow/auctionItemDetails";
import { auctionCopy } from "./auctionCopy";
import styles from "./auction.module.css";

type Row = AuctionResult["rows"][number];
function ItemFacts({ row, lang }: { row: Row; lang: "ru" | "en" }) {
  const c = auctionCopy[lang], item = row.item;
  if (!item) return <p>{c.itemUnavailable}</p>;
  return <div className={styles.itemFacts}>
    <strong>{item.name ?? `ID ${row.itemId}`}</strong>
    {item.quality ? <span>{item.quality}</span> : null}
    {row.petSpeciesId ? <p>{c.pet} {row.petSpeciesId}{row.petLevel ? ` · ${c.petLevel} ${row.petLevel}` : ""}</p> : <>
      {!auctionPreviewMatches(row, item) ? <p className={styles.variantNote}>{c.basePreview}</p> : null}
      {[item.itemLevel, item.binding, item.slot, item.requiredLevel, item.armor].map((line, i) => line ? <span key={i}>{line}</span> : null)}
      {item.weapon.map((line, i) => <span key={`weapon-${i}`}>{line}</span>)}
      {item.stats.length ? <ul>{item.stats.map((line, i) => <li key={i}>{line}</li>)}</ul> : null}
      {item.effects.map((line, i) => <p key={`effect-${i}`}>{line}</p>)}
      {item.description ? <p>{item.description}</p> : null}
    </>}
    <small>{c.itemSource}</small>
  </div>;
}
export function AuctionItem({ row, lang }: { row: Row; lang: "ru" | "en" }) {
  const c = auctionCopy[lang], [open, setOpen] = useState(false), [failedUrl, setFailedUrl] = useState<string | null>(null);
  const name = row.name ?? `ID ${row.itemId}`;
  const reference = new URL(`https://www.wowhead.com/${lang === "ru" ? "ru/" : ""}item=${row.itemId}`);
  if (row.bonusIds.length) reference.searchParams.set("bonus", row.bonusIds.join(":"));
  return <>
    <AtlasTooltip content={open ? null : <div className={styles.itemPreview}><ItemFacts row={row} lang={lang} /><p className={styles.secondary}>{c.openItem}</p></div>}>
      <button type="button" className={styles.itemTrigger} aria-haspopup="dialog" aria-expanded={open} aria-label={`${name}. ${c.openItem}`} onClick={() => setOpen(true)}>
        <span className={styles.itemIcon} aria-hidden="true">{row.item?.iconUrl && failedUrl !== row.item.iconUrl ? <Image src={row.item.iconUrl} alt="" width={40} height={40} unoptimized onError={() => setFailedUrl(row.item?.iconUrl ?? null)} /> : <Package size={22} />}</span>
        <span>{name}</span>
      </button>
    </AtlasTooltip>
    <AtlasDialog open={open} onClose={() => setOpen(false)} label={name} className={styles.itemDialog}>
      <div className={styles.itemDialogContent}>
      <ItemFacts row={row} lang={lang} />
      <div className={styles.itemActions}><a href={reference.href} target="_blank" rel="noreferrer">{c.wowhead}</a><AtlasButton onClick={() => setOpen(false)}>{c.closeItem}</AtlasButton></div>
      </div>
    </AtlasDialog>
  </>;
}
