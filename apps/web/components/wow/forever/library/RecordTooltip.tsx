import type { ReactNode } from "react";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph, TYPE_SYMBOLS } from "@/components/database/CatalogGlyph";
import { tooltipContentCopy } from "@/components/database/tooltipContentCopy";
import "@/components/database/catalogTooltip.css";
import { foreverIconUrl, type ForeverLocale, type ForeverRecord, type ForeverType } from "@/lib/forever/database/contract";
import { libraryCopy } from "./libraryCopy";
import { slotNames } from "./slotNames";

/** Sign of a record type for records the game gives no icon (creatures, quests). */
export const typeSymbol = (type: ForeverType) => TYPE_SYMBOLS[type === "npc" ? "creature" : type];

const number = (value: number, lang: ForeverLocale, digits = 0) => value.toLocaleString(tooltipContentCopy[lang].numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** «3 min», «1.5 sec» — the way the game prints a span of time. */
function span(milliseconds: number, lang: ForeverLocale) {
  const copy = tooltipContentCopy[lang], seconds = milliseconds / 1000;
  if (seconds >= 60 && seconds % 60 === 0) return `${number(seconds / 60, lang)} ${copy.min}`;
  return `${number(seconds, lang, Number.isInteger(seconds) ? 0 : 1)} ${copy.sec}`;
}

/** Copper as gold, silver and copper. */
function money(copper: number, lang: ForeverLocale) {
  const copy = tooltipContentCopy[lang], gold = Math.floor(copper / 10_000), silver = Math.floor((copper % 10_000) / 100), rest = copper % 100;
  return [gold ? `${number(gold, lang)} ${copy.unitG}` : null, silver ? `${silver} ${copy.unitS}` : null, rest || (!gold && !silver) ? `${rest} ${copy.unitC}` : null].filter(Boolean).join(" ");
}

/** Lines of the in-game tooltip of a Forever record, in the order the game prints them; empty when the record has nothing to say. */
function tooltipLines(record: ForeverRecord, lang: ForeverLocale): ReactNode[] {
  const copy = tooltipContentCopy[lang], t = libraryCopy[lang], facts = record.facts;
  const fact = (key: string) => (typeof facts[key] === "number" ? facts[key] as number : undefined);
  const text = (key: string) => (facts[key] !== undefined && facts[key] !== "" ? String(facts[key]) : undefined);
  const lines: ReactNode[] = [];
  const add = (key: string, node: ReactNode, className?: string) => lines.push(<div key={key} className={className}>{node}</div>);
  const description = record.description?.[lang] || record.description?.en;

  if (record.type === "item") {
    if (record.level) add("level", `${copy.itemLevel} ${record.level}`, "db-tooltip-level");
    if (record.slotId && slotNames[lang][record.slotId]) add("slot", slotNames[lang][record.slotId]);
    const damage = text("damage"), speed = fact("speed");
    if (damage) {
      const [low, high] = damage.split("–").map(Number);
      const perSecond = speed && Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 / (speed / 1000) : 0;
      lines.push(<div key="damage" className="db-tooltip-stats">
        <div><span>{lang === "ru" ? `${copy.damage}: ${damage}` : `${damage} ${copy.damage}`}</span>{speed ? <span>{copy.weaponSpeed} {number(speed / 1000, lang, 2)}</span> : null}</div>
        {perSecond > 0 ? <div><span>({number(perSecond, lang, 1)} {copy.damagePerSecond})</span></div> : null}
      </div>);
    }
    const armor = fact("armor");
    if (armor) add("armor", lang === "ru" ? `${copy.armor}: ${armor}` : `${armor} ${copy.armor}`);
    if (record.attributes?.length) lines.push(<div key="attributes" className="db-tooltip-stats">
      {record.attributes.map((attribute, index) => <div key={index}><span>{attribute.value > 0 ? "+" : ""}{attribute.value} {attribute.name[lang] || attribute.name.en}</span></div>)}
    </div>);
    record.effects?.forEach((effect, index) => add(`effect-${index}`, effect, "db-tooltip-effect"));
    if (record.requiredLevel && record.requiredLevel > 1) add("required", `${copy.requiresLevel} ${record.requiredLevel}`);
    if (description) add("description", description, "db-tooltip-description");
    const sell = fact("sell");
    if (sell) add("sell", <span>{copy.sellPrice}: {money(sell, lang)}</span>, "db-tooltip-price");
    return lines;
  }

  if (record.type === "spell") {
    const rank = text("rank"), cost = text("cost"), range = text("range"), cast = fact("castTime"), cooldown = fact("cooldown"), duration = fact("duration");
    if (rank) add("rank", rank, "db-tooltip-subtext");
    const pair = (key: string, left?: string, right?: string) => { if (left || right) lines.push(<div key={key} className="db-tooltip-stats"><div>{left ? <span>{left}</span> : null}{right ? <span>{right}</span> : null}</div></div>); };
    pair("cost", cost, range ? t.range(range) : undefined);
    pair("cast", cast === undefined ? undefined : cast > 0 ? `${span(cast, lang)} ${copy.cast}` : copy.instant, cooldown ? `${span(cooldown, lang)} ${copy.cooldown}` : undefined);
    if (record.requiredLevel && record.requiredLevel > 1) add("required", `${copy.requiresLevel} ${record.requiredLevel}`);
    if (description) add("description", description, "db-tooltip-spell-description");
    if (duration) add("duration", `${copy.duration}: ${span(duration, lang)}`, "db-tooltip-mechanic");
    return lines;
  }

  if (record.type === "recipe") {
    const skill = fact("skill"), yellow = fact("yellow"), grey = fact("grey");
    const profession = record.category ? t.professions[record.category as keyof typeof t.professions] : undefined;
    if (skill !== undefined) add("skill", profession ? t.requiresSkill(profession, skill) : t.skill(skill));
    else if (profession) add("profession", profession);
    if (yellow !== undefined) add("yellow", t.yellow(yellow), "db-tooltip-muted");
    if (grey !== undefined) add("grey", t.grey(grey), "db-tooltip-muted");
    return lines;
  }

  if (record.level) add("level", t.level(record.level), "db-tooltip-level");
  if (record.requiredLevel && record.requiredLevel > 1) add("required", `${copy.requiresLevel} ${record.requiredLevel}`);
  if (description) add("description", description, "db-tooltip-spell-description");
  record.locations?.forEach((location, index) => add(`location-${index}`, location, "db-tooltip-muted"));
  const reward = fact("rewardMoney");
  if (reward) add("reward", <span>{t.reward}: {money(reward, lang)}</span>, "db-tooltip-price");
  return lines;
}

/** Does the record have anything for a tooltip beyond its name? */
export const hasTooltip = (record: ForeverRecord, lang: ForeverLocale) => tooltipLines(record, lang).length > 0;

/**
 * The in-game tooltip of a Forever record, in the markup and styles of the library of the live game
 * (components/database/TooltipContent): the icon with the quality on its edge, the name and the lines of the game.
 */
export function RecordTooltip({ record, lang }: { record: ForeverRecord; lang: ForeverLocale }) {
  const name = record.name[lang] || record.name.en;
  return <div data-atlas-scope className={`db-wow-tooltip quality-${record.quality ?? 0} is-detail-page`} role="region" aria-label={`${libraryCopy[lang].tooltip}: ${name}`}>
    <span className="db-tooltip-icon" aria-hidden="true">
      <ResilientImage src={foreverIconUrl(record.icon)} alt="" fallback={<CatalogGlyph symbol={typeSymbol(record.type)} className="i" />} />
    </span>
    <div className="db-tooltip-panel">
      <div className="db-tooltip-name">{name}</div>
      {tooltipLines(record, lang)}
    </div>
  </div>;
}
