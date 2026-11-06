"use client";

import { type CSSProperties, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Box, ImageIcon } from "lucide-react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { AuditGearItem, AuditGearQuality, CharacterAuditSnapshot } from "@/lib/wow/characterAudit";
import type { Lang } from "@/lib/i18n";
import { WarcraftTooltip } from "./WarcraftTooltip";
import type { ModelViewerStatus } from "./CharacterModelViewer";
import { characterPageCopy, type CharacterPageCopy } from "./characterPageCopy";
import styles from "./characterEquipment.module.css";

const CharacterModelViewer = dynamic(() => import("./CharacterModelViewer").then((module) => module.CharacterModelViewer), { ssr: false });

/** Paper-doll order of the game: the left column, then the right column; weapons close each column. */
const leftSlots = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "MAIN_HAND"];
const rightSlots = ["WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "OFF_HAND", "RANGED"];
/** Fixture items name their slot in Russian only. */
const slotByName: Record<string, string> = {
  "Голова": "HEAD", "Шея": "NECK", "Плечи": "SHOULDER", "Спина": "BACK", "Нагрудник": "CHEST", "Наручи": "WRIST", "Руки": "HANDS",
  "Пояс": "WAIST", "Ноги": "LEGS", "Ступни": "FEET", "Кольцо 1": "FINGER_1", "Кольцо 2": "FINGER_2",
  "Аксессуар 1": "TRINKET_1", "Аксессуар 2": "TRINKET_2", "Основная рука": "MAIN_HAND", "Левая рука": "OFF_HAND",
};
/** Cosmetic slots carry no stats: they are not part of the character's equipment audit. */
const cosmetic = new Set(["SHIRT", "TABARD"]);
const slotOf = (item: AuditGearItem) => item.slotType?.toUpperCase() || slotByName[item.slot] || "";

function splitEquipment(gear: AuditGearItem[]) {
  const order = (slots: string[]) => gear
    .filter((item) => slots.includes(slotOf(item)))
    .sort((a, b) => slots.indexOf(slotOf(a)) - slots.indexOf(slotOf(b)));
  const known = new Set([...leftSlots, ...rightSlots]);
  const other = gear.filter((item) => !known.has(slotOf(item)) && !cosmetic.has(slotOf(item)));
  return { left: order(leftSlots), right: [...order(rightSlots), ...other] };
}

const qualityIndex: Record<AuditGearQuality, keyof typeof itemQualityColors | undefined> = {
  "Низкое качество": 0, "Обычный": 1, "Необычный": 2, "Редкий": 3, "Эпический": 4, "Легендарный": 5, "Артефакт": 6, "Наследуемый": 7, "Неизвестное качество": undefined,
};
const qualityStyle = (quality: AuditGearQuality) => {
  const index = qualityIndex[quality];
  return (index === undefined ? undefined : { "--item-quality": itemQualityColors[index].text }) as CSSProperties | undefined;
};

/** Equipment of the character: secondary stats, the paper doll with item icons, item level, enchant and gem
 * marks, and the official render (or the 3D model on request) between the two columns. */
export function CharacterEquipment({ snapshot, lang, modelItemsUrl }: { snapshot: CharacterAuditSnapshot; lang: Lang; modelItemsUrl?: string }) {
  const copy = characterPageCopy(lang);
  const [pinned, setPinned] = useState<string | null>(null);
  const { left, right } = splitEquipment(snapshot.gear);
  const row = (item: AuditGearItem) => <li key={`${item.slotType ?? item.slot}:${item.itemId ?? item.name}`}>
    <GearRow item={item} copy={copy} lang={lang} pinned={pinned === item.slot} hoverDisabled={pinned !== null && pinned !== item.slot} onToggle={() => setPinned((current) => current === item.slot ? null : item.slot)} />
  </li>;

  return (
    <AtlasSection id="equipment" title={copy.equipment} className={styles.section}>
      <MaterialPlaque kit={CHARACTERS_KIT} className={styles.plaque} data-character-equipment>
        <StatsRow stats={snapshot.combatStats} copy={copy} lang={lang} />
        <div className={styles.doll}>
          <ul className={styles.column} data-column="left">{left.map(row)}</ul>
          <CharacterFigure snapshot={snapshot} copy={copy} lang={lang} modelItemsUrl={modelItemsUrl} />
          <ul className={styles.column} data-column="right">{right.map(row)}</ul>
        </div>
      </MaterialPlaque>
    </AtlasSection>
  );
}

function StatsRow({ stats, copy, lang }: { stats?: CharacterAuditSnapshot["combatStats"]; copy: CharacterPageCopy; lang: Lang }) {
  if (!stats) return null;
  const percent = (value: number) => `${value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const rows = [[copy.crit, stats.crit], [copy.haste, stats.haste], [copy.mastery, stats.mastery], [copy.versatility, stats.versatility]] as const;
  return <dl className={styles.stats} aria-label={copy.stats}>
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number.isFinite(value) ? percent(value) : "—"}</dd></div>)}
  </dl>;
}

function CharacterFigure({ snapshot, copy, lang, modelItemsUrl }: { snapshot: CharacterAuditSnapshot; copy: CharacterPageCopy; lang: Lang; modelItemsUrl?: string }) {
  const [model, setModel] = useState(false);
  const [modelState, setModelState] = useState<ModelViewerStatus>("loading");
  const render = snapshot.media?.render;
  // The render (or the emblem) stays on stage until the model is drawn, then cross-fades to it.
  const shown = model && modelState === "ready" ? "model" : "picture";
  return <figure className={styles.figure} data-figure={model ? "model" : render ? "render" : "empty"} data-shown={shown}>
    <div className={styles.stage}>
      {render
        ? <span className={styles.renderFrame} aria-hidden="true"><img className={styles.render} src={render} alt="" loading="lazy" decoding="async" /></span>
        : <span className={styles.emblem} aria-hidden="true"><img src={snapshot.specialization.iconUrl} alt="" loading="lazy" /></span>}
      {model ? <CharacterModelViewer lang={lang} appearance={snapshot.appearance} characterName={snapshot.character.name} characterSlug={snapshot.slug} modelItemsUrl={modelItemsUrl} onStatus={setModelState} /> : null}
    </div>
    <button type="button" className={styles.figureToggle} aria-pressed={model} onClick={() => { setModelState("loading"); setModel((value) => !value); }}>
      {model && render ? <ImageIcon aria-hidden="true" /> : <Box aria-hidden="true" />}{copy.model3d}
    </button>
  </figure>;
}

function GearRow({ item, copy, lang, pinned, hoverDisabled, onToggle }: { item: AuditGearItem; copy: CharacterPageCopy; lang: Lang; pinned: boolean; hoverDisabled: boolean; onToggle: () => void }) {
  const { enchant, sockets = [] } = item.details;
  const warn = item.state === "issue" || item.state === "missing";
  const marks = [
    enchant ? (enchant.active ? `${copy.enchant}: ${enchant.name}` : copy.noEnchant) : "",
    ...sockets.map((socket) => socket.filled ? socket.gem : copy.emptySocket),
  ].filter(Boolean).join(", ");
  return <WarcraftTooltip block pinned={pinned} hoverDisabled={hoverDisabled} onPinnedClose={onToggle} locale={lang} atlasScope content={<GearTooltip item={item} copy={copy} />}>
    <button type="button" className={styles.item} style={qualityStyle(item.details.quality)} data-state={item.state} aria-pressed={pinned} aria-label={`${item.slot}: ${item.name}, ${copy.itemLevel.toLowerCase()} ${item.itemLevel}${marks ? `. ${marks}` : ""}`} onClick={onToggle}>
      <span className={materialStyles.iconFrame} style={materialIconFrameStyle(CHARACTERS_KIT, 44)}>
        {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" decoding="async" /> : null}
      </span>
      <span className={styles.itemCopy}>
        <small>{item.slot}</small>
        <b>{item.name}</b>
      </span>
      <span className={styles.itemMeta}>
        <strong>{warn ? <AlertTriangle className={styles.warn} aria-hidden="true" /> : null}{item.itemLevel}</strong>
        {enchant || sockets.length ? <span className={styles.marks} aria-hidden="true">
          {enchant ? <i data-mark="enchant" data-active={enchant.active || undefined} /> : null}
          {sockets.map((socket, index) => <i key={index} data-mark="socket" data-active={socket.filled || undefined} />)}
        </span> : null}
      </span>
    </button>
  </WarcraftTooltip>;
}

function GearTooltip({ item, copy }: { item: AuditGearItem; copy: CharacterPageCopy }) {
  const details = item.details;
  const quality = copy.quality[details.quality];
  const secondaries = details.secondaries.map((stat) => `${stat.value} ${stat.label}`.trim()).filter(Boolean);
  return <div className={styles.tip} style={qualityStyle(details.quality)}>
    <header>
      <span className={materialStyles.iconFrame} style={materialIconFrameStyle(CHARACTERS_KIT, 44)}>{item.iconUrl ? <img src={item.iconUrl} alt="" /> : null}</span>
      <span><strong>{item.name}</strong><small>{[quality, details.category].filter(Boolean).join(" · ")}</small></span>
    </header>
    <p className={styles.tipLevel}>{copy.itemLevel} <b>{item.itemLevel}</b></p>
    {details.weapon ? <p className={styles.tipLine}><b>{details.weapon.damage}</b> · {copy.speed} {details.weapon.speed}<br />{details.weapon.dps} {copy.dps}</p> : null}
    {details.armor ? <p className={styles.tipLine}>{details.armor}</p> : null}
    {details.primary || details.stamina || secondaries.length ? <ul className={styles.tipStats}>
      {details.primary ? <li>{details.primary}</li> : null}
      {details.stamina ? <li>{details.stamina}</li> : null}
      {secondaries.map((stat) => <li key={stat} data-secondary>{stat}</li>)}
    </ul> : null}
    {details.enchant ? <p className={styles.tipMod} data-active={details.enchant.active || undefined}>{details.enchant.active ? details.enchant.name : copy.noEnchant}{!details.enchant.active && details.enchant.effect ? <small>{details.enchant.effect}</small> : null}</p> : null}
    {details.sockets?.map((socket, index) => <p key={index} className={styles.tipMod} data-socket data-active={socket.filled || undefined}>{socket.filled ? socket.gem : copy.emptySocket}</p>)}
    {details.set ? <div className={styles.tipSet}>
      <strong>{details.set.name}{details.set.total ? ` (${details.set.equipped}/${details.set.total})` : ""}</strong>
      {details.set.bonuses.map((bonus) => <span key={bonus.pieces} data-active={bonus.active || undefined}>({bonus.pieces}) {bonus.text}</span>)}
    </div> : null}
    {item.state === "issue" ? <p className={styles.tipWarn}><AlertTriangle aria-hidden="true" />{copy.upgrade}</p> : null}
  </div>;
}
