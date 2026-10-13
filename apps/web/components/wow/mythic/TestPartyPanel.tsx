"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, Crosshair, HeartPulse, LogIn, MapPin, Plus, RotateCcw, Shield, Sparkles, Sword, Trash2, Users, Zap } from "lucide-react";
import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import type { RouteStop } from "./rubyLifePoolsData";
import { initialAssignments, partyMembers, positions, type PartyAssignment, type PartyMember, type PartyRole, type PartyTalent } from "./testPartyData";
import { partyPositionLabel, partyRoleLabels, plainPartyText, testPartyCopy, type TestPartyCopy } from "./testPartyCopy";
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
  "Перед боссом": { left: "50%", top: "29%" },
  "Мили слева": { left: "35%", top: "46%" },
  "Мили справа": { left: "65%", top: "46%" },
  "Дальний слева": { left: "23%", top: "73%" },
  "Дальний справа": { left: "77%", top: "73%" },
  "У края": { left: "50%", top: "86%" },
};

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
  const copy = testPartyCopy[locale];
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
    announce(copy.nowPlaying(member?.character ?? memberId));
  }, [announce, copy]);

  const copyBuild = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inspectedMember.buildCode);
      announce(copy.buildCopied);
    } catch {
      window.prompt(copy.copyBuildPrompt, inspectedMember.buildCode);
    }
  }, [announce, copy, inspectedMember.buildCode]);

  const changeDraftMember = useCallback((memberId: string) => {
    const member = partyMembers.find((item) => item.id === memberId) ?? partyMembers[0];
    setDraftMemberId(memberId);
    setDraftAbility(member.abilities[0]);
  }, []);

  const addAssignment = useCallback(() => {
    const instruction = draftInstruction.trim();
    if (!instruction) {
      announce(copy.needInstruction);
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
    announce(copy.assignmentAdded);
  }, [announce, copy, draftAbility, draftInstruction, draftMemberId, draftPosition, draftSecond, selectedStop.id]);

  const resetParty = useCallback(() => {
    setAssignments(initialAssignments);
    setActiveMemberId(partyMembers[0].id);
    setInspectedMemberId(partyMembers[0].id);
    window.localStorage.removeItem(storageKey);
    announce(copy.partyReset);
  }, [announce, copy]);

  const removeAssignment = useCallback((id: string) => {
    setAssignments((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <section className={styles.shell} aria-labelledby="party-planner-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><Users aria-hidden="true" /> {copy.eyebrow}</span>
          <h2 id="party-planner-title">{copy.title}</h2>
          <p>{copy.lede}</p>
        </div>
        <div className={styles.sessionControls}>
          <label>
            <span>{copy.playingAs}</span>
            <select value={activeMemberId} onChange={(event) => logIn(event.target.value)}>
              {partyMembers.map((member) => <option key={member.id} value={member.id}>{member.account} · {member.character}</option>)}
            </select>
          </label>
          <p className={styles.liveState}><Check aria-hidden="true" /> {copy.savedLocally}</p>
        </div>
      </header>

      <div data-demo-party>
        <AtlasNotice tone="caution" title={copy.demoTitle}>{copy.demoText}</AtlasNotice>
      </div>

      <div className={styles.dashboard}>
        <PartyRoster
          copy={copy}
          locale={locale}
          activeMemberId={activeMemberId}
          inspectedMemberId={inspectedMemberId}
          assignments={assignments}
          onInspect={setInspectedMemberId}
          onLogin={logIn}
          onReset={resetParty}
        />
        <PartyLoadout
          copy={copy}
          locale={locale}
          inspectedMember={inspectedMember}
          selectedStopId={selectedStop.id}
          talentTree={talentTree}
          onTalentTreeChange={setTalentTree}
          onCopyBuild={copyBuild}
        />
        <PartyBriefing
          copy={copy}
          locale={locale}
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
        copy={copy}
        locale={locale}
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
      <p className={styles.localeNote}>{copy.localeNote}</p>
    </section>
  );
});

const PartyRoster = memo(function PartyRoster({ copy, locale, activeMemberId, inspectedMemberId, assignments, onInspect, onLogin, onReset }: {
  copy: TestPartyCopy;
  locale: Locale;
  activeMemberId: string;
  inspectedMemberId: string;
  assignments: PartyAssignment[];
  onInspect: (memberId: string) => void;
  onLogin: (memberId: string) => void;
  onReset: () => void;
}) {
  return (
    <section className={styles.roster} aria-label={copy.rosterLabel}>
      <div className={styles.panelTitle}><span><Users aria-hidden="true" /> {copy.roster}</span><b>{copy.allReady}</b></div>
      <div className={styles.roleSummary} aria-label={copy.rolesLabel}><span data-role="tank"><Shield aria-hidden="true" /> {copy.roleCounts.tank}</span><span data-role="healer"><HeartPulse aria-hidden="true" /> {copy.roleCounts.healer}</span><span data-role="dps"><Sword aria-hidden="true" /> {copy.roleCounts.dps}</span></div>
      <div className={styles.memberList}>
        {partyMembers.map((member) => {
          const isInspected = inspectedMemberId === member.id;
          const isActive = activeMemberId === member.id;
          const assignmentCount = assignments.filter((assignment) => assignment.memberId === member.id).length;
          return (
            <article key={member.id} className={styles.memberCard} data-inspected={isInspected || undefined} style={{ "--member-accent": member.accent } as React.CSSProperties}>
              <button type="button" className={styles.memberMain} onClick={() => onInspect(member.id)} aria-pressed={isInspected}>
                <span className={styles.memberPortrait}><Image src={member.portrait} width={48} height={48} alt="" /></span>
                <span className={styles.memberIdentity}>
                  <b>{member.character}</b>
                  <small>{member.spec} · {member.className}</small>
                  <em data-role={member.role}><RoleIcon role={member.role} /> {partyRoleLabels[locale][member.role]} · {copy.itemLevel(member.itemLevel)}</em>
                </span>
                <span className={styles.memberScore}><b>{member.rating}</b><small>{copy.rating}</small><em title={copy.assignedActions}><MapPin aria-hidden="true" /> {assignmentCount}</em></span>
              </button>
              {isActive ? <span className={styles.youBadge}><Check aria-hidden="true" /> {copy.you}</span> : <button type="button" className={styles.loginButton} onClick={() => onLogin(member.id)} title={copy.logInAs(member.character)} aria-label={copy.logInAs(member.character)}><LogIn aria-hidden="true" /></button>}
            </article>
          );
        })}
      </div>
      <button type="button" className={styles.resetButton} onClick={onReset}><RotateCcw aria-hidden="true" /> {copy.resetParty}</button>
    </section>
  );
});

const PartyLoadout = memo(function PartyLoadout({ copy, locale, inspectedMember, selectedStopId, talentTree, onTalentTreeChange, onCopyBuild }: {
  copy: TestPartyCopy;
  locale: Locale;
  inspectedMember: PartyMember;
  selectedStopId: number;
  talentTree: TalentTreeFilter;
  onTalentTreeChange: (tree: TalentTreeFilter) => void;
  onCopyBuild: () => void;
}) {
  const visibleTalents = talentTree === "all" ? inspectedMember.talents : inspectedMember.talents.filter((talent) => talent.tree === talentTree);
  return (
    <section className={styles.loadout} aria-label={copy.talentsLabel(inspectedMember.character)}>
      <div className={styles.panelTitle}><span><Zap aria-hidden="true" /> {copy.abilitiesTitle}</span><b>{copy.buildTitle}</b></div>
      <div className={styles.loadoutHero} style={{ "--member-accent": inspectedMember.accent } as React.CSSProperties}>
        <span className={styles.loadoutPortrait}><Image src={inspectedMember.portrait} width={64} height={64} alt="" /><i data-role={inspectedMember.role}><RoleIcon role={inspectedMember.role} /></i></span>
        <div className={styles.loadoutIdentity}>
          <span>{inspectedMember.account}</span>
          <h3>{inspectedMember.character}</h3>
          <p>{inspectedMember.spec} · {partyRoleLabels[locale][inspectedMember.role]}</p>
          <dl><div><dt>{copy.itemLevelShort}</dt><dd>{inspectedMember.itemLevel}</dd></div><div><dt>{copy.ratingShort}</dt><dd>{inspectedMember.rating}</dd></div><div><dt>{copy.keyAbilities}</dt><dd>{inspectedMember.abilities.length}</dd></div></dl>
        </div>
        <button type="button" className={styles.copyBuildButton} onClick={onCopyBuild}><Copy aria-hidden="true" /> <span>{copy.copyBuild}<small>{copy.copyBuildHint}</small></span></button>
      </div>
      <div className={styles.talentToolbar} role="group" aria-label={copy.talentFilter}>
        <span><Crosshair aria-hidden="true" /> {copy.chosenTalents}</span>
        <div>{(["all", "class", "spec", "hero"] as TalentTreeFilter[]).map((tree) => <button key={tree} type="button" onClick={() => onTalentTreeChange(tree)} aria-pressed={talentTree === tree}>{tree === "all" ? copy.allTrees : copy.trees[tree]}</button>)}</div>
      </div>
      <div className={styles.talentGrid}>
        {visibleTalents.map((talent, index) => (
          <article key={talent.name} className={styles.talent}>
            <span className={styles.talentIcon}><TalentIcon tree={talent.tree} /></span>
            <div><em>{copy.trees[talent.tree]} · {String(index + 1).padStart(2, "0")}</em><b>{talent.name}</b><small>{plainPartyText(talent.detail)}</small></div>
          </article>
        ))}
      </div>
      <div className={styles.buildCode}><span>{copy.buildCode}</span><code>{inspectedMember.buildCode}</code><i><Check aria-hidden="true" /> {copy.fitsKey(selectedStopId > 10 ? 15 : 12)}</i></div>
    </section>
  );
});

const PartyBriefing = memo(function PartyBriefing({ copy, locale, selectedStop, routeStops, stopAssignments, assignedPlayers, firstCall, finalCall, onSelectStop, onInspectMember, onRemoveAssignment }: {
  copy: TestPartyCopy;
  locale: Locale;
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
    <section className={styles.briefing} aria-label={copy.briefingLabel}>
      <div className={styles.briefHeader}>
        <div><span><Crosshair aria-hidden="true" /> {copy.briefingEyebrow}</span><h3>{selectedStop.title}</h3><p>{copy.briefingLede}</p></div>
        <label><span>{copy.selectedStep}</span><select value={selectedStop.id} onChange={(event) => onSelectStop(Number(event.target.value))}>{routeStops.map((stop, index) => <option key={stop.id} value={stop.id}>{index + 1}. {stop.title}</option>)}</select></label>
      </div>
      <div className={styles.briefStats} aria-label={copy.statsLabel}>
        <article><span>{copy.totalActions}</span><b>{String(stopAssignments.length).padStart(2, "0")}</b><small>{copy.inThisStep}</small></article>
        <article><span>{copy.involved}</span><b>{assignedPlayers} / 5</b><small>{copy.partyPlayers}</small></article>
        <article><span>{copy.firstToLast}</span><b>0:{String(firstCall).padStart(2, "0")}—0:{String(finalCall).padStart(2, "0")}</b><small>{copy.secondsAfterPull}</small></article>
      </div>
      <div className={styles.formation} aria-label={copy.formationLabel}>
        <div className={styles.formationHud} aria-hidden="true"><span>{copy.formationTitle}</span><span>{copy.topView}</span></div>
        <div className={styles.boss}><span><Shield aria-hidden="true" /></span><b>{copy.enemies}</b><small>{copy.dangerFront}</small></div>
        {stopAssignments.map((assignment) => {
          const member = partyMembers.find((item) => item.id === assignment.memberId);
          if (!member) return null;
          const position = partyPositionLabel(assignment.position, locale);
          return <button key={assignment.id} type="button" className={styles.formationMember} style={{ ...positionCoordinates[assignment.position], "--member-accent": member.accent } as React.CSSProperties} onClick={() => onInspectMember(member.id)} title={`${member.character}: ${position}`}><span><Image src={member.portrait} width={36} height={36} alt="" /></span><b>{member.character}</b><small>{position}</small></button>;
        })}
        <span className={styles.groupStart}>{copy.groupStart}</span>
      </div>
      <div className={styles.timelineHeading}><span><Clock3 aria-hidden="true" /> {copy.timelineTitle}</span><b>{copy.planReady}</b></div>
      <div className={styles.timeline}>
        {stopAssignments.length ? stopAssignments.map((assignment, index) => {
          const member = partyMembers.find((item) => item.id === assignment.memberId) ?? partyMembers[0];
          return (
            <article key={assignment.id} className={styles.assignment} style={{ "--member-accent": member.accent } as React.CSSProperties}>
              <span className={styles.assignmentStep}>{String(index + 1).padStart(2, "0")}</span>
              <time><Clock3 aria-hidden="true" /> 0:{String(assignment.second).padStart(2, "0")}</time>
              <Image src={member.portrait} width={32} height={32} alt="" />
              <div><b>{member.character}</b><span><MapPin aria-hidden="true" /> {partyPositionLabel(assignment.position, locale)}</span><strong><Zap aria-hidden="true" /> {copy.presses(assignment.ability)}</strong><p>{plainPartyText(assignment.instruction)}</p></div>
              <button type="button" onClick={() => onRemoveAssignment(assignment.id)} aria-label={copy.removeAssignment(member.character)}><Trash2 aria-hidden="true" /></button>
            </article>
          );
        }) : <p className={styles.empty}>{copy.noAssignments}</p>}
      </div>
    </section>
  );
});

const PartyAssignmentBuilder = memo(function PartyAssignmentBuilder({ copy, locale, selectedStopTitle, draftMemberId, draftAbility, draftPosition, draftSecond, draftInstruction, draftMember, onDraftMemberChange, onDraftAbilityChange, onDraftPositionChange, onDraftSecondChange, onDraftInstructionChange, onAddAssignment }: {
  copy: TestPartyCopy;
  locale: Locale;
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
    <section className={styles.assignmentBuilder} aria-label={copy.builderLabel}>
      <div className={styles.builderTitle}><span className={styles.builderIcon}><Plus aria-hidden="true" /></span><div><b>{copy.builderTitle}</b><small>{copy.builderStep(selectedStopTitle)}</small></div></div>
      <label><span>{copy.who}</span><select value={draftMemberId} onChange={(event) => onDraftMemberChange(event.target.value)}>{partyMembers.map((member) => <option key={member.id} value={member.id}>{member.character}</option>)}</select></label>
      <label><span>{copy.whatToPress}</span><select value={draftAbility} onChange={(event) => onDraftAbilityChange(event.target.value)}>{draftMember.abilities.map((ability) => <option key={ability}>{ability}</option>)}</select></label>
      <label><span>{copy.whereToStand}</span><select value={draftPosition} onChange={(event) => onDraftPositionChange(event.target.value)}>{positions.map((position) => <option key={position} value={position}>{partyPositionLabel(position, locale)}</option>)}</select></label>
      <label><span>{copy.whenSeconds}</span><input type="number" min="0" max="240" value={draftSecond} onChange={(event) => onDraftSecondChange(Number(event.target.value))} /></label>
      <label className={styles.command}><span>{copy.task}</span><input value={draftInstruction} onChange={(event) => onDraftInstructionChange(event.target.value)} placeholder={copy.taskPlaceholder} onKeyDown={(event) => { if (event.key === "Enter") onAddAssignment(); }} /></label>
      <button type="button" className={styles.addButton} onClick={onAddAssignment}><Plus aria-hidden="true" /> {copy.addAction}</button>
    </section>
  );
});
