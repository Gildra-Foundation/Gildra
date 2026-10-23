"use client";

import { ResilientImage } from "@/components/media/ResilientImage";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { Tooltip } from "@gildra/atlas-ui/valyro-ui/basic/Tooltip";
import bridge from "@gildra/atlas-ui/valyroAtlasBridge.module.css";
import { cloneElement, useState, type ButtonHTMLAttributes, type ReactElement } from "react";
import type { PullIntel, PullRole } from "./mdtPullIntel";
import styles from "./mdtPullDetails.module.css";

const copy = {
  ru: {
    enemies: "Мобы в пуле", casts: "Способности и реакция", roles: "Действия по ролям", tank: "Танк", healer: "Лекарь", dps: "Бойцы", all: "Вся группа",
    more: (count: number) => `Ещё ${count} — в полной памятке`, close: "Закрыть", open: "Нажмите, чтобы открыть полную памятку", notes: "Тактика из старого редактора — черновые заметки, не проверенные в игре.",
    noCasts: "Здесь нет выделенных боевых заклинаний. Следуйте указанным действиям события.",
    missing: "Для этих мобов ещё нет привязанных способностей. Состав пула известен; список кастов не подтверждён.",
    uncovered: "Нет заметок", facts: "Сведения из источников", source: "Источник", conflicts: "Советы, для которых отмечены расхождения с источниками, не перенесены.",
    checked: "Сверено с источниками", spell: "Заклинание", guide: "Тактика", patch: "Патч", event: "Действие в событии",
    general: "Общие рекомендации", tankDefault: "Контролируйте сбор группы и направление атак; готовьте защиту к опасным ударам.", healerDefault: "Следите за здоровьем группы, готовьте лечение и снятие негативных эффектов.", dpsDefault: "Согласуйте порядок прерываний и контроля, не дублируйте их и следуйте приоритету целей.",
    actions: { "Кик": "Прервать", "Стоп": "Остановить контролем", "Диспел": "Снять негативный эффект", "Пурж": "Снять усиление", "Фокус": "Приоритетная цель", "Уклонение": "Уклониться", "Защита": "Подготовить защиту" },
  },
  en: {
    enemies: "Enemies in this pull", casts: "Abilities and response", roles: "Role assignments", tank: "Tank", healer: "Healer", dps: "Damage dealers", all: "Whole party",
    more: (count: number) => `${count} more in the full briefing`, close: "Close", open: "Press to open the full briefing", notes: "Tactics from the legacy editor are draft notes, not tested in game.",
    noCasts: "There are no listed combat spells here. Follow the event instructions above.",
    missing: "No abilities are linked to these enemies yet. Pull composition is known; casts are not confirmed.",
    uncovered: "No notes", facts: "Source notes", source: "Source", conflicts: "Draft advice flagged as conflicting with sources has not been transferred.",
    checked: "Checked against sources", spell: "Spell", guide: "Strategy", patch: "Patch", event: "Event instruction",
    general: "General guidance", tankDefault: "Control the pull and attack direction; prepare mitigation for dangerous hits.", healerDefault: "Watch party health and prepare healing and dispels.", dpsDefault: "Coordinate interrupts and crowd control, avoid overlapping them and follow target priority.",
    actions: { "Кик": "Interrupt", "Стоп": "Crowd control", "Диспел": "Dispel the debuff", "Пурж": "Purge the buff", "Фокус": "Priority target", "Уклонение": "Dodge", "Защита": "Prepare a defensive" },
  },
} as const;

function PullBriefing({ intel, locale, full = false }: { intel: PullIntel; locale: "ru" | "en"; full?: boolean }) {
  const t = copy[locale];
  return <div className={styles.briefing} data-testid="pull-briefing">
    <section><h4>{t.enemies}</h4><ul className={styles.enemies}>{intel.enemies.map(enemy => <li key={enemy.npcId ?? enemy.name}>
      <span className={styles.enemyIdentity}><ResilientImage className={styles.portrait} src={enemy.portraitUrl} alt="" width={48} height={48} loading="lazy" data-testid="pull-npc-image" fallback={<span className={styles.portraitFallback} aria-hidden="true">{enemy.name.slice(0, 1)}</span>} /><span><b>{enemy.count} ×</b> {enemy.name}{full && enemy.url && <a className={styles.entitySource} href={enemy.url} target="_blank" rel="noreferrer">NPC ↗</a>}</span></span>
      {!enemy.covered && <small>{t.uncovered}</small>}{enemy.note && <p className={styles.eventNote}>{enemy.note}</p>}
    </li>)}</ul></section>
    <section><h4>{t.casts}</h4>{intel.mechanics.length ? <ul className={styles.mechanics}>{intel.mechanics.slice(0, full ? undefined : 3).map(ability => <li key={`${ability.npcId ?? ability.source}:${ability.name}`}>
      <div className={styles.abilityIdentity}><ResilientImage className={styles.spellIcon} src={ability.iconUrl} alt="" width={36} height={36} loading="lazy" data-testid="pull-spell-image" /><div><b>{ability.name}</b><span>{ability.source}</span></div></div>
      <p className={styles.action}>{t.actions[ability.action]} · {t[ability.role]}</p>
      {ability.response && <p className={styles.response}>{ability.response}</p>}
      {full && ability.url && <div className={styles.abilitySources}><a href={ability.url} target="_blank" rel="noreferrer">{t.spell} #{ability.spellId} ↗</a>{ability.guideUrl && <a href={ability.guideUrl} target="_blank" rel="noreferrer">{t.guide} ↗</a>}</div>}
    </li>)}</ul> : <p className={styles.muted}>{intel.checkedAt ? t.noCasts : t.missing}</p>}{!full && intel.mechanics.length > 3 && <p className={styles.muted}>{t.more(intel.mechanics.length - 3)}</p>}</section>
    <section><h4>{t.roles}</h4><dl className={styles.roles}>{(["tank", "healer", "dps"] as PullRole[]).map(role => {
      const tasks = intel.mechanics.filter(ability => ability.role === role || ability.role === "all");
      const notes = intel.roleNotes[role];
      return <div key={role}><dt>{t[role]}</dt><dd>
        {tasks.length > 0 && <ul>{tasks.slice(0, full ? undefined : 1).map(ability => <li key={`${ability.npcId ?? ability.source}:${ability.name}`}>{ability.name}: {t.actions[ability.action]}</li>)}</ul>}
        {(full ? notes : tasks.length ? [] : notes.slice(0, 1)).map(note => <p key={note}>{note}</p>)}
        {!tasks.length && !notes.length && <p><small>{t.general}:</small> {t[`${role}Default`]}</p>}
      </dd></div>;
    })}</dl></section>
    {intel.facts.length > 0 && <section><h4>{t.facts}</h4><ul className={styles.facts}>{intel.facts.slice(0, full ? undefined : 1).map(fact => <li key={`${fact.source}:${fact.en}`}>{fact[locale]}{full && <> <a href={fact.source} target="_blank" rel="noreferrer">{t.source} ↗</a></>}</li>)}</ul></section>}
    <p className={styles.notice}>{intel.checkedAt ? <>{t.checked}: <time dateTime={intel.checkedAt}>{intel.checkedAt}</time> · {t.patch} {intel.patch}{full && intel.sources && <> · {intel.sources.map((url, index) => <span key={url}> <a href={url} target="_blank" rel="noreferrer">{t.source} {index + 1} ↗</a></span>)}</>}</> : <>{t.notes}{intel.hasConflicts && <> {t.conflicts}</>}</>}</p>
    {!full && <p className={styles.hint}>{t.open}</p>}
  </div>;
}

/** Reuse Valyro's hover/focus and collision handling; touch opens the same briefing in a native dialog. */
export function MdtPullDetails({ title, intel, locale, children }: { title: string; intel: PullIntel; locale: "ru" | "en"; children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> }) {
  const [open, setOpen] = useState(false);
  return <>
    <Tooltip disabled={open} placement="right" animation="fade" delay={180} className={`${bridge.scope} ${styles.tooltip}`} content={<><h3 className={styles.title}>{title}</h3><PullBriefing intel={intel} locale={locale} /></>}>
      {cloneElement(children, { onClick: () => setOpen(true), "aria-haspopup": "dialog", "aria-expanded": open })}
    </Tooltip>
    <AtlasDialog open={open} onClose={() => setOpen(false)} label={title} variant="sheet"><div className={styles.dialogContent}><header className={styles.dialogHeader}><h3>{title}</h3><button type="button" onClick={() => setOpen(false)}>{copy[locale].close}</button></header><div className={styles.dialogBody} data-testid="pull-briefing-scroll" tabIndex={0} role="region" aria-label={title}><PullBriefing intel={intel} locale={locale} full /></div></div></AtlasDialog>
  </>;
}
