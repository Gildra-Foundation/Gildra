import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { playerText } from "@/lib/gameText";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { achievementTooltipCopy } from "./achievementTooltipCopy";

type Data = Record<string, unknown>;
const object = (value: unknown): Data | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Data : undefined;
const entries = (value: unknown): Data[] => Array.isArray(value) ? value.map(object).filter((entry): entry is Data => Boolean(entry)) : [];

function RecordLink({ record, text, lang }: { record: Data; text?: string; lang: Lang }) {
  const name = playerText(text || String(record.name ?? ""), lang);
  if (!name) return null;
  return record.id && record.type
    ? <Link href={libraryRecordPath(lang, String(record.type), String(record.id), String(record.slug ?? ""))}>{name}</Link>
    : <>{name}</>;
}

function hasVisibleCriterion(node: Data): boolean {
  return Boolean(node.text) || ([5, 6, 7, 8, 9].includes(Number(node.operator)) && Number(node.amount) > 0) || entries(node.children).some(hasVisibleCriterion);
}

function Criterion({ node, lang, root = false }: { node: Data; lang: Lang; root?: boolean }) {
  const copy = achievementTooltipCopy[lang];
  const children = entries(node.children).filter(hasVisibleCriterion);
  const target = object(node.target);
  const text = playerText(String(node.text ?? ""), lang);
  const amount = Number(node.amount);
  const operator = Number(node.operator);
  const groupLabel = ({ 5: copy.total, 6: copy.highest, 7: copy.started, 8: copy.atLeast, 9: copy.total } as Record<number, string>)[operator];
  const faction = node.faction === "alliance" ? copy.alliance : node.faction === "horde" ? copy.horde : "";
  // The root's description is already above this list, and can be stale in DB2.
  const showText = text && !(root && children.length > 0);
  if (!showText && !children.length && !(groupLabel && amount > 0)) return null;
  return <>
    {showText ? <span>{operator === 1 ? `${copy.notComplete}: ` : ""}{target ? <RecordLink record={target} text={text} lang={lang} /> : text}{!children.length && amount > 1 ? [5, 196].includes(Number(node.criteria_type)) ? ` · ${copy.level} ${amount.toLocaleString(lang)}` : ` × ${amount.toLocaleString(lang)}` : ""}{faction ? ` · ${faction}` : ""}</span> : null}
    {groupLabel && amount > 0 ? <div className="db-tooltip-muted">{groupLabel}: {amount.toLocaleString(lang)}</div> : null}
    {children.length ? <ul>{children.map((child, index) => <li key={String(child.id ?? index)}><Criterion node={child} lang={lang} /></li>)}</ul> : null}
  </>;
}

/** Uses the existing tooltip typography; criteria remain semantic nested lists. */
export function AchievementTooltip({ block, lang }: { block: Data; lang: Lang }) {
  const copy = achievementTooltipCopy[lang];
  const sourceCriteria = object(block.criteria);
  const criteria = sourceCriteria && hasVisibleCriterion(sourceCriteria) ? sourceCriteria : undefined;
  const rewards = entries(block.rewards);
  const previous = object(block.previous);
  const next = entries(block.next);
  const rewardText = playerText(String(block.reward_text ?? ""), lang);
  const categories = entries(block.categories).slice().reverse();
  return <div className="db-tooltip-quest-info">
    {categories.length ? <div className="db-tooltip-muted">{categories.map((category, index) => <span key={String(category.id)}>{index ? " › " : ""}<Link href={`${lang === "ru" ? "/ru" : ""}/library/achievements?facet=${encodeURIComponent(String(category.path))}`}>{String(category.name ?? "")}</Link></span>)}</div> : null}
    {typeof block.points === "number" ? <div>{copy.points}: {block.points}</div> : null}
    {block.account_wide === true ? <div>{copy.account}</div> : null}
    {block.faction === "alliance" || block.faction === "horde" ? <div>{copy[block.faction]}</div> : null}
    {criteria ? <div><strong>{copy.criteria}</strong><Criterion node={criteria} lang={lang} root /></div> : null}
    {rewardText || rewards.length ? <div className="db-tooltip-set"><strong>{copy.reward}</strong>{rewardText ? <div>{rewardText}</div> : null}{rewards.length ? <ul>{rewards.map((reward) => <li key={`${reward.type}:${reward.external_id}`}><RecordLink record={reward} lang={lang} /></li>)}</ul> : null}</div> : null}
    {previous ? <div>{copy.previous}: <RecordLink record={previous} lang={lang} /></div> : null}
    {next.map((record) => <div key={`${record.type}:${record.external_id}`}>{copy.next}: <RecordLink record={record} lang={lang} /></div>)}
  </div>;
}
