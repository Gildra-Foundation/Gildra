"use client";

import Image from "next/image";
import { type CSSProperties, useState } from "react";
import { Package } from "lucide-react";
import type { GearPlannerItemData } from "@/lib/wow/gearPlannerPresentation";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { WarcraftTooltip } from "./WarcraftTooltip";
import styles from "./gearPlannerItem.module.css";

const qualities = [
  ["Низкое качество", "Poor"], ["Обычный", "Common"], ["Необычный", "Uncommon"],
  ["Редкий", "Rare"], ["Эпический", "Epic"], ["Легендарный", "Legendary"],
  ["Артефакт", "Artifact"], ["Наследуемый", "Heirloom"],
];
const statNames: Record<string, [string, string]> = {
  strength: ["Сила", "Strength"], agility: ["Ловкость", "Agility"], intellect: ["Интеллект", "Intellect"],
  stamina: ["Выносливость", "Stamina"], crit_rating: ["Критический удар", "Critical strike"],
  haste_rating: ["Скорость", "Haste"], mastery_rating: ["Искусность", "Mastery"],
  versatility_rating: ["Универсальность", "Versatility"], armor: ["Броня", "Armor"],
  stragiint: ["Сила, ловкость или интеллект", "Strength, agility or intellect"],
  stragi: ["Сила или ловкость", "Strength or agility"], agiint: ["Ловкость или интеллект", "Agility or intellect"],
  strint: ["Сила или интеллект", "Strength or intellect"], speed_rating: ["Скорость передвижения", "Speed"],
  leech_rating: ["Самоисцеление", "Leech"], avoidance_rating: ["Избегание", "Avoidance"],
};
function qualityStyle(quality?: number): CSSProperties | undefined {
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  return palette ? { "--gear-quality-frame": palette.frame, "--gear-quality-text": palette.text } as CSSProperties : undefined;
}

function FramedIcon({ item, showLevel = true }: { item: GearPlannerItemData; showLevel?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = item.iconUrl;
  return <span className={styles.icon} style={qualityStyle(item.quality)} data-quality={item.quality} aria-hidden="true">
    {src && failed !== src ? <Image src={src} alt="" fill sizes="48px" unoptimized onError={() => setFailed(src)} /> : <Package />}
    {showLevel && item.itemLevel !== undefined && item.itemLevel > 0 ? <span className={styles.iconLevel}>{item.itemLevel}</span> : null}
  </span>;
}

export function GearPlannerItem({ item, locale, verified = true, compact = false }: {
  item: GearPlannerItemData;
  locale: "ru" | "en";
  verified?: boolean;
  compact?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const number = (n: number) => new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(n);
  const quality = item.quality !== undefined ? qualities[item.quality]?.[ru ? 0 : 1] : undefined;
  const statOrder = ["armor", "strength", "agility", "intellect", "stragiint", "stragi", "agiint", "strint", "stamina", "crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "leech_rating", "avoidance_rating", "speed_rating"];
  const stats = verified ? Object.entries(item.stats ?? {}).filter(([key, value]) => statNames[key] && Number.isFinite(value) && value > 0).sort(([a], [b]) => statOrder.indexOf(a) - statOrder.indexOf(b)) : [];
  const statLines = verified ? item.statLines?.filter(Boolean) : undefined;
  const content = <div className={styles.description}>
    <header className={styles.header} style={qualityStyle(item.quality)}>
      <FramedIcon item={item} showLevel={verified} />
      <div><strong data-quality={item.quality}>{item.name}</strong>{quality ? <span>{quality}</span> : null}</div>
    </header>
    {verified && item.itemLevel !== undefined ? <dl className={styles.level}><dt>{t("Уровень предмета", "Item level")}</dt><dd>{number(item.itemLevel)}</dd></dl> : null}
    {verified && item.requiredLevel !== undefined && item.requiredLevel > 0 ? <p className={styles.requirement}>{t("Требуется уровень", "Requires level")} {item.requiredLevel}</p> : null}
    {stats.length ? <dl className={styles.stats}>{stats.map(([key, value]) => <div key={key}><dt>{statNames[key][ru ? 0 : 1]}</dt><dd>+{number(value)}</dd></div>)}</dl> : statLines?.length ? <ul className={styles.stats}>{statLines.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul> : null}
    {verified && item.effects?.length ? <div className={styles.effects}>{item.effects.map((effect, index) => <p key={`${index}:${effect}`}>{effect}</p>)}</div> : null}
    {!verified ? <p className={styles.unverified}>{t("Свойства награды для вашего уровня пока не подтверждены. Этот предмет не считается улучшением.", "The reward properties at your level have not been verified. This item is not counted as an upgrade.")}</p> : null}
    {item.source ? <div className={styles.source}><span>{t("Источник", "Source")}</span><p>{item.source}</p></div> : null}
    <footer>{pinned ? t("Нажмите по предмету ещё раз или Esc, чтобы закрыть", "Click the item again or press Esc to close") : t("Нажмите по предмету, чтобы закрепить описание", "Click the item to keep its details open")}</footer>
  </div>;
  return <WarcraftTooltip content={content} pinned={pinned} onPinnedClose={() => setPinned(false)} locale={locale} atlasScope className={styles.tooltip}>
    {tooltipId => <button type="button" className={`${styles.trigger} ${compact ? styles.compact : ""}`} style={qualityStyle(item.quality)} data-quality={item.quality} aria-pressed={pinned} aria-describedby={tooltipId} aria-label={`${item.name}${verified && item.itemLevel !== undefined ? `, ${t("уровень предмета", "item level")} ${item.itemLevel}` : ""}. ${t("Описание предмета", "Item details")}`} onClick={() => setPinned(value => !value)}>
      <FramedIcon item={item} showLevel={verified} />
      {!compact ? <span className={styles.name}>{item.name}</span> : null}
    </button>}
  </WarcraftTooltip>;
}
