"use client";

import Image from "next/image";
import { AlertTriangle, CheckCircle2, ChevronRight, Crosshair, ExternalLink, Flag, Map, Shield, Skull, Sparkles, Swords, Users } from "lucide-react";
import { useState } from "react";
import { partyMembers } from "../mythic/testPartyData";
import { getRaidTactic, type TacticalMarker } from "./midnightRaidTactics";
import type { RaidBoss } from "./midnightRaidData";
import styles from "./raidTacticalBoard.module.css";

const markerIcons: Record<TacticalMarker["kind"], typeof Skull> = { boss: Skull, add: Swords, objective: Flag };
const roleLabels = { tank: { ru: "Танк", en: "Tank" }, healer: { ru: "Лекарь", en: "Healer" }, dps: { ru: "Боец", en: "Damage" } };
const memberIdentityEn: Record<string, { className: string; spec: string }> = {
  vexis: { className: "Warrior", spec: "Protection" },
  mystic: { className: "Shaman", spec: "Restoration" },
  nova: { className: "Mage", spec: "Arcane" },
  grave: { className: "Death Knight", spec: "Frost" },
  wind: { className: "Hunter", spec: "Beast Mastery" },
};

export function RaidTacticalBoard({ boss, locale }: { boss: RaidBoss; locale: "ru" | "en" }) {
  const tactic = getRaidTactic(boss.slug);
  const [phaseId, setPhaseId] = useState(tactic?.phases[0]?.id ?? "");
  const [selectedMember, setSelectedMember] = useState(partyMembers[0].id);
  if (!tactic) return null;

  const t = (text: { ru: string; en: string }) => text[locale];
  const phase = tactic.phases.find((item) => item.id === phaseId) ?? tactic.phases[0];
  const activeAssignment = phase.assignments.find((item) => item.memberId === selectedMember) ?? phase.assignments[0];
  const activeMember = partyMembers.find((item) => item.id === activeAssignment.memberId) ?? partyMembers[0];
  const identity = (member: (typeof partyMembers)[number]) => locale === "en" ? memberIdentityEn[member.id] : { className: member.className, spec: member.spec };

  return (
    <section className={styles.board} data-testid="raid-tactical-board">
      <header className={styles.boardHeader}>
        <div className={styles.titleLockup}>
          <span className={styles.seal}><Map aria-hidden="true" /></span>
          <div><small>{locale === "ru" ? "Боевой план · Normal/Heroic" : "Battle plan · Normal/Heroic"}</small><h3>{locale === "ru" ? "Тактическая карта" : "Tactical map"}</h3><p>{locale === "ru" ? "Расстановка встроенной группы-примера, порядок целей и действия по фазам. Mythic-заметки показаны только там, где они есть в источнике." : "Fixed example-squad formation, target order, and phase execution. Mythic notes appear only where the source provides them."}</p></div>
        </div>
        <a href={tactic.source} target="_blank" rel="noreferrer" className={styles.sourceLink}><CheckCircle2 aria-hidden="true" /><span>{locale === "ru" ? "Экспертный гайд · проверен 14.09.2026" : "Expert guide · checked Sep 14, 2026"}</span><ExternalLink aria-hidden="true" /></a>
      </header>

      <div className={styles.phaseTabs} role="tablist" aria-label={locale === "ru" ? "Фазы боя" : "Encounter phases"}>
        {tactic.phases.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={phase.id === item.id} onClick={() => setPhaseId(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><b>{t(item.name)}</b><ChevronRight aria-hidden="true" /></button>)}
      </div>

      <div className={styles.phaseBrief} key={`${boss.slug}-${phase.id}`}><span><Sparkles aria-hidden="true" /></span><div><small>{locale === "ru" ? "Команда рейд-лида" : "Raid lead call"}</small><p>{t(phase.summary)}</p></div></div>

      <div className={styles.tacticalGrid}>
        <div className={styles.arenaPanel}>
          <div className={styles.arenaTop}><span><Crosshair aria-hidden="true" />{locale === "ru" ? "Схема арены" : "Arena plan"}</span><b>{locale === "ru" ? "Север / босс" : "North / boss"} ↑</b></div>
          <div className={styles.arena} data-layout={phase.layout}>
            <div className={styles.arenaRunes} aria-hidden="true" />
            {phase.zones.map((zone, index) => <div key={`${zone.label.en}-${index}`} className={`${styles.zone} ${styles[zone.kind]}`} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`, transform: `rotate(${zone.rotate ?? 0}deg)` }}><span>{t(zone.label)}</span></div>)}
            {phase.markers.map((marker, index) => {
              const Icon = markerIcons[marker.kind];
              return <div key={`${marker.label.en}-${index}`} className={`${styles.encounterMarker} ${styles[marker.kind]}`} style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>
                <span>{marker.kind === "boss" ? <Image src={boss.artwork} alt="" fill sizes="42px" /> : <Icon aria-hidden="true" />}</span><b>{t(marker.label)}</b>
              </div>;
            })}
            {phase.assignments.map((assignment) => {
              const member = partyMembers.find((item) => item.id === assignment.memberId);
              if (!member) return null;
              const selected = member.id === activeMember.id;
              return <button key={member.id} type="button" aria-pressed={selected} aria-label={`${member.character}: ${t(assignment.position)}`} className={styles.playerMarker} style={{ left: `${assignment.x}%`, top: `${assignment.y}%`, "--member-accent": member.accent } as React.CSSProperties} onClick={() => setSelectedMember(member.id)}>
                <span><Image src={member.portrait} alt="" fill sizes="38px" /></span><b>{member.character}</b><small>{t(assignment.position)}</small>
              </button>;
            })}
          </div>
          <div className={styles.legend}><span><i className={styles.legendSafe} />{locale === "ru" ? "безопасно" : "safe"}</span><span><i className={styles.legendSoak} />{locale === "ru" ? "замачивание" : "soak"}</span><span><i className={styles.legendDanger} />{locale === "ru" ? "опасность" : "danger"}</span></div>
        </div>

        <aside className={styles.orders}>
          <article className={styles.memberOrder} style={{ "--member-accent": activeMember.accent } as React.CSSProperties}>
            <header><span><Image src={activeMember.portrait} alt="" fill sizes="52px" /></span><div><small>{locale === "ru" ? "Личная задача" : "Personal assignment"}</small><h4>{activeMember.character}</h4><p>{identity(activeMember).className} · {identity(activeMember).spec} · {roleLabels[activeMember.role][locale]}</p></div></header>
            <div className={styles.positionLine}><Map aria-hidden="true" /><span><small>{locale === "ru" ? "Позиция" : "Position"}</small><b>{t(activeAssignment.position)}</b></span></div>
            <div className={styles.abilityLine}><Sparkles aria-hidden="true" /><span><small>{locale === "ru" ? "Ключевая кнопка" : "Key ability"}</small><b>{activeAssignment.ability}</b></span></div>
            <p className={styles.personalTask}>{t(activeAssignment.task)}</p>
          </article>

          <article className={styles.orderList}><header><Crosshair aria-hidden="true" /><span><small>{locale === "ru" ? "Кого бить" : "What to attack"}</small><b>{locale === "ru" ? "Приоритет целей" : "Target priority"}</b></span></header><ol>{phase.priorities.map((item, index) => <li key={item.en}><span>{index + 1}</span><p>{t(item)}</p></li>)}</ol></article>
          <article className={`${styles.orderList} ${styles.dangerList}`}><header><AlertTriangle aria-hidden="true" /><span><small>{locale === "ru" ? "Чего остерегаться" : "What to avoid"}</small><b>{locale === "ru" ? "Критические ошибки" : "Critical failures"}</b></span></header><ul>{phase.dangers.map((item) => <li key={item.en}><i /><p>{t(item)}</p></li>)}</ul></article>
        </aside>
      </div>

      <div className={styles.partySection}>
        <header><Users aria-hidden="true" /><span><small>{locale === "ru" ? "Встроенная группа-пример" : "Fixed example squad"}</small><b>{locale === "ru" ? "Нажмите на персонажа — карта покажет его задачу" : "Select a character to reveal their assignment"}</b></span></header>
        <div className={styles.partyStrip}>{phase.assignments.map((assignment) => {
          const member = partyMembers.find((item) => item.id === assignment.memberId);
          if (!member) return null;
          return <button key={member.id} type="button" aria-pressed={member.id === activeMember.id} onClick={() => setSelectedMember(member.id)} style={{ "--member-accent": member.accent } as React.CSSProperties}><span><Image src={member.portrait} alt="" fill sizes="42px" /></span><span><b>{member.character}</b><small>{identity(member).spec} · {roleLabels[member.role][locale]}</small></span><Shield aria-hidden="true" /></button>;
        })}</div>
      </div>

      <div className={styles.execution}>
        <header><Flag aria-hidden="true" /><span><small>{locale === "ru" ? "Исполнение" : "Execution"}</small><b>{locale === "ru" ? "Порядок действий" : "Action sequence"}</b></span></header>
        <ol>{phase.steps.map((step, index) => <li key={step.en}><span>{String(index + 1).padStart(2, "0")}</span><i /><p>{t(step)}</p></li>)}</ol>
      </div>
    </section>
  );
}
