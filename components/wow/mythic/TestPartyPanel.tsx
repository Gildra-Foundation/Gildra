"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, Crosshair, HeartPulse, LogIn, MapPin, Plus, RotateCcw, Shield, Sparkles, Sword, Trash2, Users, Zap } from "lucide-react";
import type { RouteStop } from "./rubyLifePoolsData";
import { initialAssignments, partyMembers, positions, type PartyAssignment, type PartyMember, type PartyRole, type PartyTalent } from "./testPartyData";
import styles from "./testPartyPanel.module.css";

type Locale = "en" | "ru";
type TalentTreeFilter = "all" | "class" | "spec" | "hero";

const storageKey = "gildra:mythic:test-party:v2";
function readSavedPartyState() {
  const defaultMemberId = partyMembers[0].id;
  try {
    if (typeof window === "undefined") return { activeMemberId: defaultMemberId, assignments: initialAssignments };
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as {
      activeMemberId?: string;
      assignments?: PartyAssignment[];
    } | null;
    const activeMemberId = saved?.activeMemberId && partyMembers.some((member) => member.id === saved.activeMemberId)
      ? saved.activeMemberId
      : defaultMemberId;
    return {
      activeMemberId,
      assignments: saved?.assignments?.length ? saved.assignments : initialAssignments,
    };
  } catch {
    return { activeMemberId: defaultMemberId, assignments: initialAssignments };
  }
}

const positionCoordinates: Record<string, { left: string; top: string }> = {
  "Перед боссом": { left: "50%", top: "24%" },
  "Мили слева": { left: "35%", top: "46%" },
  "Мили справа": { left: "65%", top: "46%" },
  "Дальний слева": { left: "23%", top: "73%" },
  "Дальний справа": { left: "77%", top: "73%" },
  "У края": { left: "50%", top: "86%" },
};

const roleLabel: Record<PartyRole, string> = { tank: "Защита", healer: "Лечение", dps: "Урон" };
const treeLabel = { class: "Общие", spec: "Специализация", hero: "Героические" } as const;

function positionLabel(position: string) {
  if (position === "Мили слева") return "Рядом слева";
  if (position === "Мили справа") return "Рядом справа";
  if (position === "Дальний слева") return "Вдали слева";
  if (position === "Дальний справа") return "Вдали справа";
  return position;
}

function plainPartyText(text: string) {
  return text
    .replaceAll("АоЕ-сайленс", "Запрещает всем врагам произносить заклинания")
    .replaceAll("ranged interrupt", "Прерывание издалека")
    .replaceAll("magic defensive", "защита от магии")
    .replaceAll("defensive", "защита")
    .replaceAll("Mitigation", "Использовать защиту")
    .replaceAll("stun", "оглушение")
    .replaceAll("Бёрст-лечение", "Очень сильное лечение")
    .replaceAll("Бёрст", "Сильный урон")
    .replaceAll("бёрста", "сильного урона")
    .replaceAll("Кик", "Прервать")
    .replaceAll("кик", "прерывание")
    .replaceAll("Стоп", "Остановить")
    .replaceAll("Пурж", "Снять усиление")
    .replaceAll("Bloodlust", "Усиление всей группы")
    .replaceAll("паков", "групп врагов")
    .replaceAll("паком", "группой врагов")
    .replaceAll("пулл", "группу врагов")
    .replaceAll("пак", "группу врагов")
    .replaceAll("whelps", "маленьких драконов")
    .replaceAll("стаков", "уровней эффекта")
    .replaceAll("аддах", "дополнительных врагах");
}

function RoleIcon({ role }: { role: PartyRole }) {
  if (role === "tank") return <Shield aria-hidden="true" />;
  if (role === "healer") return <HeartPulse aria-hidden="true" />;
  return <Sword aria-hidden="true" />;
}

function TalentIcon({ tree }: { tree: PartyTalent["tree"] }) {
  if (tree === "class") return <Shield aria-hidden="true" />;
  if (tree === "hero") return <Sparkles aria-hidden="true" />;
  return <Zap aria-hidden="true" />;
}

export const TestPartyPanel = memo(function TestPartyPanel({
  locale,
  routeStops,
  selectedStop,
  onSelectStop,
}: {
  locale: Locale;
  routeStops: RouteStop[];
  selectedStop: RouteStop;
  onSelectStop: (stopId: number) => void;
}) {
  const [savedParty] = useState(readSavedPartyState);
  const [activeMemberId, setActiveMemberId] = useState(savedParty.activeMemberId);
  const [inspectedMemberId, setInspectedMemberId] = useState(savedParty.activeMemberId);
  const [assignments, setAssignments] = useState<PartyAssignment[]>(savedParty.assignments);
  const [status, setStatus] = useState("");
  const [draftMemberId, setDraftMemberId] = useState(partyMembers[0].id);
  const [draftAbility, setDraftAbility] = useState(partyMembers[0].abilities[0]);
  const [draftPosition, setDraftPosition] = useState(positions[0]);
  const [draftSecond, setDraftSecond] = useState(0);
  const [draftInstruction, setDraftInstruction] = useState("");
  const [talentTree, setTalentTree] = useState<TalentTreeFilter>("all");

  const inspectedMember = partyMembers.find((member) => member.id === inspectedMemberId) ?? partyMembers[0];
  const draftMember = partyMembers.find((member) => member.id === draftMemberId) ?? partyMembers[0];
  const stopAssignments = useMemo(
    () => assignments.filter((item) => item.stopId === selectedStop.id).sort((a, b) => a.second - b.second),
    [assignments, selectedStop.id],
  );
  const assignedPlayers = new Set(stopAssignments.map((assignment) => assignment.memberId)).size;
  const firstCall = stopAssignments[0]?.second ?? 0;
  const finalCall = stopAssignments.at(-1)?.second ?? 0;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ activeMemberId, assignments }));
  }, [activeMemberId, assignments]);

  const announce = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
  }, []);

  const logIn = useCallback((memberId: string) => {
    setActiveMemberId(memberId);
    setInspectedMemberId(memberId);
    const member = partyMembers.find((item) => item.id === memberId);
    announce(`Вы играете за ${member?.character ?? memberId}`);
  }, [announce]);

  const copyBuild = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inspectedMember.buildCode);
      announce("Код билда скопирован");
    } catch {
      window.prompt("Скопируйте код билда", inspectedMember.buildCode);
    }
  }, [announce, inspectedMember.buildCode]);

  const changeDraftMember = useCallback((memberId: string) => {
    const member = partyMembers.find((item) => item.id === memberId) ?? partyMembers[0];
    setDraftMemberId(memberId);
    setDraftAbility(member.abilities[0]);
  }, []);

  const addAssignment = useCallback(() => {
    const instruction = draftInstruction.trim();
    if (!instruction) {
      announce("Добавьте короткую команду игроку");
      return;
    }
    setAssignments((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        stopId: selectedStop.id,
        memberId: draftMemberId,
        second: Math.max(0, draftSecond),
        position: draftPosition,
        ability: draftAbility,
        instruction,
      },
    ]);
    setDraftInstruction("");
    announce("Назначение добавлено");
  }, [announce, draftAbility, draftInstruction, draftMemberId, draftPosition, draftSecond, selectedStop.id]);

  const resetParty = useCallback(() => {
    setAssignments(initialAssignments);
    setActiveMemberId(partyMembers[0].id);
    setInspectedMemberId(partyMembers[0].id);
    window.localStorage.removeItem(storageKey);
    announce("Тестовая пати сброшена");
  }, [announce]);

  const removeAssignment = useCallback((id: string) => {
    setAssignments((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <section className={styles.shell} aria-labelledby="party-planner-title" data-reveal>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><Users aria-hidden="true" /> 5 игроков · один общий план</span>
          <h2 id="party-planner-title">Команда и план действий</h2>
          <p>Состав группы, способности каждого игрока и все действия для выбранного шага маршрута.</p>
        </div>
        <div className={styles.sessionControls}>
          <label>
            <span>Я играю за</span>
            <select value={activeMemberId} onChange={(event) => logIn(event.target.value)}>
              {partyMembers.map((member) => <option key={member.id} value={member.id}>{member.account} · {member.character}</option>)}
            </select>
          </label>
          <div className={styles.liveState}><i /> Изменения сохранены на этом устройстве</div>
        </div>
      </header>

      <p data-demo-party role="note" style={{ margin: "0 0 16px", padding: "12px 14px", border: "1px solid rgba(183, 131, 66, .72)", background: "rgba(35, 24, 13, .86)" }}>
        <strong>{locale === "ru" ? "Демонстрационные тестовые данные." : "Demonstration test data."}</strong>{" "}
        {locale === "ru"
          ? "Персонажи, уровни предметов, рейтинг, билды и назначения ниже вымышлены только для проверки интерфейса и не являются игровыми рекомендациями."
          : "The characters, item levels, rating, builds, and assignments below are fictional UI fixtures and are not gameplay recommendations."}
      </p>

      <div className={styles.dashboard}>
        <PartyRoster
          activeMemberId={activeMemberId}
          inspectedMemberId={inspectedMemberId}
          assignments={assignments}
          onInspect={setInspectedMemberId}
          onLogin={logIn}
          onReset={resetParty}
        />
        <PartyLoadout
          inspectedMember={inspectedMember}
          selectedStopId={selectedStop.id}
          talentTree={talentTree}
          onTalentTreeChange={setTalentTree}
          onCopyBuild={copyBuild}
        />
        <PartyBriefing
          selectedStop={selectedStop}
          routeStops={routeStops}
          stopAssignments={stopAssignments}
          assignedPlayers={assignedPlayers}
          firstCall={firstCall}
          finalCall={finalCall}
          onSelectStop={onSelectStop}
          onInspectMember={setInspectedMemberId}
          onRemoveAssignment={removeAssignment}
        />
      </div>

      <PartyAssignmentBuilder
        selectedStopTitle={selectedStop.title}
        draftMemberId={draftMemberId}
        draftAbility={draftAbility}
        draftPosition={draftPosition}
        draftSecond={draftSecond}
        draftInstruction={draftInstruction}
        draftMember={draftMember}
        onDraftMemberChange={changeDraftMember}
        onDraftAbilityChange={setDraftAbility}
        onDraftPositionChange={setDraftPosition}
        onDraftSecondChange={setDraftSecond}
        onDraftInstructionChange={setDraftInstruction}
        onAddAssignment={addAssignment}
      />
      <p className={styles.status} role="status">{status}</p>
      <span className={styles.localeNote}>{locale === "ru" ? "Тестовые персонажи · изменения хранятся только в этом браузере" : "Demo characters · changes are stored only in this browser"}</span>
    </section>
  );
});

const PartyRoster = memo(function PartyRoster({ activeMemberId, inspectedMemberId, assignments, onInspect, onLogin, onReset }: {
  activeMemberId: string;
  inspectedMemberId: string;
  assignments: PartyAssignment[];
  onInspect: (memberId: string) => void;
  onLogin: (memberId: string) => void;
  onReset: () => void;
}) {
  return (
    <section className={styles.roster} aria-label="Состав группы">
      <div className={styles.panelTitle}><span><Users /> Команда</span><b><i /> Все 5 готовы</b></div>
      <div className={styles.roleSummary} aria-label="Роли группы"><span><Shield /> 1 защищает</span><span><HeartPulse /> 1 лечит</span><span><Sword /> 3 атакуют</span></div>
      <div className={styles.memberList}>
        {partyMembers.map((member) => {
          const isInspected = inspectedMemberId === member.id;
          const isActive = activeMemberId === member.id;
          const assignmentCount = assignments.filter((assignment) => assignment.memberId === member.id).length;
          return (
            <article key={member.id} className={`${styles.memberCard} ${isInspected ? styles.inspected : ""}`} style={{ "--member-accent": member.accent } as React.CSSProperties}>
              <button type="button" className={styles.memberMain} onClick={() => onInspect(member.id)} aria-pressed={isInspected}>
                <span className={styles.memberPortrait}><Image src={member.portrait} width={56} height={56} alt="" /><i /></span>
                <span className={styles.memberIdentity}>
                  <b>{member.character}</b>
                  <small>{member.spec} · {member.className}</small>
                  <em><RoleIcon role={member.role} /> {roleLabel[member.role]} <i /> уровень {member.itemLevel}</em>
                </span>
                <span className={styles.memberScore}><b>{member.rating}</b><small>рейтинг</small><em title="Назначено действий"><MapPin /> {assignmentCount}</em></span>
              </button>
              {isActive ? <span className={styles.youBadge}><Check /> Вы</span> : <button type="button" className={styles.loginButton} onClick={() => onLogin(member.id)} title={`Войти как ${member.character}`}><LogIn /></button>}
            </article>
          );
        })}
      </div>
      <button type="button" className={styles.resetButton} onClick={onReset}><RotateCcw /> Вернуть исходный состав</button>
    </section>
  );
});

const PartyLoadout = memo(function PartyLoadout({ inspectedMember, selectedStopId, talentTree, onTalentTreeChange, onCopyBuild }: {
  inspectedMember: PartyMember;
  selectedStopId: number;
  talentTree: TalentTreeFilter;
  onTalentTreeChange: (tree: TalentTreeFilter) => void;
  onCopyBuild: () => void;
}) {
  const visibleTalents = talentTree === "all" ? inspectedMember.talents : inspectedMember.talents.filter((talent) => talent.tree === talentTree);
  return (
    <section className={styles.loadout} aria-label={`Таланты ${inspectedMember.character}`}>
      <div className={styles.panelTitle}><span><Zap /> Способности игрока</span><b>Билд для подземелья</b></div>
      <div className={styles.loadoutHero} style={{ "--member-accent": inspectedMember.accent } as React.CSSProperties}>
        <span className={styles.loadoutPortrait}><Image src={inspectedMember.portrait} width={72} height={72} alt="" /><i><RoleIcon role={inspectedMember.role} /></i></span>
        <div className={styles.loadoutIdentity}><span>{inspectedMember.account}</span><h3>{inspectedMember.character}</h3><p>{inspectedMember.spec} · {roleLabel[inspectedMember.role]}</p><div><b>{inspectedMember.itemLevel}<small>УРОВЕНЬ</small></b><b>{inspectedMember.rating}<small>РЕЙТИНГ</small></b><b>{inspectedMember.abilities.length}<small>ВАЖНЫХ УМЕНИЙ</small></b></div></div>
        <button type="button" onClick={onCopyBuild}><Copy /> <span>Скопировать билд<small>Для импорта в игру</small></span></button>
      </div>
      <div className={styles.talentToolbar} aria-label="Фильтр талантов">
        <span><Crosshair /> Выбранные таланты</span>
        <div>{(["all", "class", "spec", "hero"] as TalentTreeFilter[]).map((tree) => <button key={tree} type="button" className={talentTree === tree ? styles.activeTalentTree : ""} onClick={() => onTalentTreeChange(tree)} aria-pressed={talentTree === tree}>{tree === "all" ? "Все" : treeLabel[tree]}</button>)}</div>
      </div>
      <div className={styles.talentGrid}>
        {visibleTalents.map((talent, index) => (
          <article key={talent.name} className={styles.talent} data-tree={talent.tree}>
            <span className={styles.talentIcon}><TalentIcon tree={talent.tree} /></span>
            <div><em>{treeLabel[talent.tree]} <i /> 0{index + 1}</em><b>{talent.name}</b><small>{plainPartyText(talent.detail)}</small></div>
          </article>
        ))}
      </div>
      <div className={styles.buildCode}><span>КОД ДЛЯ ИГРЫ</span><code>{inspectedMember.buildCode}</code><i><Check /> подходит для +{selectedStopId > 10 ? 15 : 12}</i></div>
    </section>
  );
});

const PartyBriefing = memo(function PartyBriefing({ selectedStop, routeStops, stopAssignments, assignedPlayers, firstCall, finalCall, onSelectStop, onInspectMember, onRemoveAssignment }: {
  selectedStop: RouteStop;
  routeStops: RouteStop[];
  stopAssignments: PartyAssignment[];
  assignedPlayers: number;
  firstCall: number;
  finalCall: number;
  onSelectStop: (stopId: number) => void;
  onInspectMember: (memberId: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
}) {
  return (
    <section className={styles.briefing} aria-label="Тактические назначения">
      <div className={styles.briefHeader}>
        <div><span><Crosshair /> Кто, где и когда</span><h3>{selectedStop.title}</h3><p>Действия команды для выбранного шага маршрута</p></div>
        <label><span>Выбранный шаг</span><select value={selectedStop.id} onChange={(event) => onSelectStop(Number(event.target.value))}>{routeStops.map((stop, index) => <option key={stop.id} value={stop.id}>{index + 1}. {stop.title}</option>)}</select></label>
      </div>
      <div className={styles.briefStats} aria-label="Сводка назначений">
        <article><span>Всего действий</span><b>{String(stopAssignments.length).padStart(2, "0")}</b><small>в этом шаге</small></article>
        <article><span>Участвуют</span><b>{assignedPlayers} / 5</b><small>игроков команды</small></article>
        <article><span>От первого до последнего</span><b>0:{String(firstCall).padStart(2, "0")}—0:{String(finalCall).padStart(2, "0")}</b><small>секунды после начала боя</small></article>
      </div>
      <div className={styles.formation} aria-label="Схема позиций группы">
        <div className={styles.formationHud} aria-hidden="true"><span>РАССТАНОВКА ГРУППЫ</span><i /><span>ВИД СВЕРХУ</span></div>
        <div className={styles.boss}><span><Shield /></span><b>Враги</b><small>опасная зона спереди</small></div>
        {stopAssignments.map((assignment) => {
          const member = partyMembers.find((item) => item.id === assignment.memberId);
          if (!member) return null;
          return <button key={assignment.id} type="button" className={styles.formationMember} style={{ ...positionCoordinates[assignment.position], "--member-accent": member.accent } as React.CSSProperties} onClick={() => onInspectMember(member.id)} title={`${member.character}: ${positionLabel(assignment.position)}`}><span><Image src={member.portrait} width={38} height={38} alt="" /><i /></span><b>{member.character}</b><small>{positionLabel(assignment.position)}</small></button>;
        })}
        <span className={styles.groupStart}>Старт группы</span>
      </div>
      <div className={styles.timelineHeading}><span><Clock3 /> Что происходит по порядку</span><b><i /> План готов</b></div>
      <div className={styles.timeline}>
        {stopAssignments.length ? stopAssignments.map((assignment, index) => {
          const member = partyMembers.find((item) => item.id === assignment.memberId) ?? partyMembers[0];
          return (
            <article key={assignment.id} className={styles.assignment} style={{ "--member-accent": member.accent } as React.CSSProperties}>
              <span className={styles.assignmentStep}>{String(index + 1).padStart(2, "0")}</span>
              <time><Clock3 /> 0:{String(assignment.second).padStart(2, "0")}</time>
              <Image src={member.portrait} width={32} height={32} alt="" />
              <div><b>{member.character}</b><span><MapPin /> {positionLabel(assignment.position)}</span><strong><Zap /> Нажимает: {assignment.ability}</strong><p>{plainPartyText(assignment.instruction)}</p></div>
              <button type="button" onClick={() => onRemoveAssignment(assignment.id)} aria-label={`Удалить назначение ${member.character}`}><Trash2 /></button>
            </article>
          );
        }) : <p className={styles.empty}>Для этой точки пока нет назначений.</p>}
      </div>
    </section>
  );
});

const PartyAssignmentBuilder = memo(function PartyAssignmentBuilder({ selectedStopTitle, draftMemberId, draftAbility, draftPosition, draftSecond, draftInstruction, draftMember, onDraftMemberChange, onDraftAbilityChange, onDraftPositionChange, onDraftSecondChange, onDraftInstructionChange, onAddAssignment }: {
  selectedStopTitle: string;
  draftMemberId: string;
  draftAbility: string;
  draftPosition: string;
  draftSecond: number;
  draftInstruction: string;
  draftMember: PartyMember;
  onDraftMemberChange: (memberId: string) => void;
  onDraftAbilityChange: (ability: string) => void;
  onDraftPositionChange: (position: string) => void;
  onDraftSecondChange: (second: number) => void;
  onDraftInstructionChange: (instruction: string) => void;
  onAddAssignment: () => void;
}) {
  return (
    <section className={styles.assignmentBuilder} aria-label="Добавить действие игроку">
      <div><span className={styles.builderIcon}><Plus /></span><div><b>Добавить действие</b><small>Шаг «{selectedStopTitle}»</small></div></div>
      <label><span>Кто</span><select value={draftMemberId} onChange={(event) => onDraftMemberChange(event.target.value)}>{partyMembers.map((member) => <option key={member.id} value={member.id}>{member.character}</option>)}</select></label>
      <label><span>Что нажать</span><select value={draftAbility} onChange={(event) => onDraftAbilityChange(event.target.value)}>{draftMember.abilities.map((ability) => <option key={ability}>{ability}</option>)}</select></label>
      <label><span>Где стоять</span><select value={draftPosition} onChange={(event) => onDraftPositionChange(event.target.value)}>{positions.map((position) => <option key={position} value={position}>{positionLabel(position)}</option>)}</select></label>
      <label className={styles.seconds}><span>Когда, сек.</span><input type="number" min="0" max="240" value={draftSecond} onChange={(event) => onDraftSecondChange(Number(event.target.value))} /></label>
      <label className={styles.command}><span>Задача</span><input value={draftInstruction} onChange={(event) => onDraftInstructionChange(event.target.value)} placeholder="Например: прервать второе заклинание" onKeyDown={(event) => { if (event.key === "Enter") onAddAssignment(); }} /></label>
      <button type="button" className={styles.addButton} onClick={onAddAssignment}><Plus /> Добавить действие</button>
    </section>
  );
});
