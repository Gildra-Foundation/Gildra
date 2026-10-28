"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { usePullRolePreference, pullRoleCopy } from "../shared/usePullRolePreference";
import { PlayerProfilePicker } from "../shared/PlayerProfilePicker";
import { raidHubControlLayout } from "./raidHubControls";
import { raidCardThemes } from "./raidCardThemes";
import type { RaidHubSlug } from "./raidHubData";
import type { CSSProperties } from "react";
import { RaidPullMap } from "./RaidPullMap";
import { RaidPullBriefing } from "./RaidPullBriefing";
import { raidPullCopy } from "./raidPullCopy";
import { RaidPlannerPullPosition, RaidPlannerTextMark } from "./VoidspirePlannerArt";
import { voidspirePlannerClass, voidspirePlannerLayout } from "./voidspirePlannerLayout";
import type { RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import styles from "./raidPulls.module.css";
import bossStyles from "./raidBossPlanner.module.css";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import glass from "./voidspireGlass.module.css";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}
const readHash = () => window.location.hash;
const serverHash = () => "";

type WorkspaceProps = { plan: RaidPullPlan; locale: "ru" | "en" };
type RoleSelection = RaidPullRole | "all";

export function RaidPullWorkspace(props: WorkspaceProps) {
  return props.plan.slug === "the-voidspire" ? <VoidspirePullWorkspace {...props} /> : <LocalRoleWorkspace {...props} />;
}

function VoidspirePullWorkspace(props: WorkspaceProps) {
  const { role, profile, spec, setProfile, selectRole, setRole } = usePullRolePreference();
  return <RaidPullWorkspaceContent {...props} role={spec?.role ?? role} onRoleChange={selectRole} spec={spec}
    playerPicker={<PlayerProfilePicker locale={props.locale} themeClassName={glass.menuTheme} profile={profile}
      onProfileChange={setProfile} onRoleChange={setRole} />} />;
}

function LocalRoleWorkspace(props: WorkspaceProps) {
  const [role, setRole] = useState<RoleSelection>("all");
  return <RaidPullWorkspaceContent {...props} role={role} onRoleChange={(value) => setRole(value as RoleSelection)} />;
}

function RaidPullWorkspaceContent({ plan, locale, role, onRoleChange, playerPicker, spec }: WorkspaceProps & { role: RoleSelection; onRoleChange: (value: string) => void; playerPicker?: ReactNode; spec?: NonNullable<ReturnType<typeof usePullRolePreference>["spec"]> }) {
  const t = raidPullCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const encounter = Boolean(plan.encounter);
  const label = encounter ? bossCopy.phase : t.pull;
  const [difficulty, setDifficulty] = useState<"normal" | "heroic">("normal");
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const active = Math.max(0, plan.pulls.findIndex((pull) => hash === `#raid-pull=${pull.id}`));
  const pull = plan.pulls[active];
  const panel = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  function select(index: number, reveal = false) {
    if (index < 0 || index >= plan.pulls.length) return;
    const url = new URL(window.location.href);
    url.hash = `raid-pull=${plan.pulls[index].id}`;
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    const choice = strip.current?.querySelector<HTMLElement>(`[data-raid-pull-choice="${index}"]`);
    if (strip.current && choice) strip.current.scrollLeft = choice.offsetLeft - strip.current.offsetLeft - strip.current.clientWidth / 2 + choice.clientWidth / 2;
    if (reveal && window.matchMedia("(max-width: 900px)").matches) panel.current?.scrollIntoView({ block: "start", behavior: lessMotion() ? "instant" : "smooth" });
  }
  const slug = plan.slug as RaidHubSlug;
  return <div className={`${styles.workspace} ${voidspirePlannerClass(plan.slug)} ${plan.slug === "the-voidspire" ? glass.surface : ""}`} data-raid-pulls={plan.slug} data-raid-boss-planner={plan.encounter?.bossSlug} data-difficulty={encounter ? difficulty : undefined} style={{ ...raidHubControlLayout(slug), ...voidspirePlannerLayout(plan.slug), "--raid-card-accent": raidCardThemes[slug].accent } as CSSProperties}>
    <RaidWorkspaceRoleToolbar plan={plan} locale={locale} role={role} onRoleChange={onRoleChange} playerPicker={playerPicker} />
    {encounter && <div className={bossStyles.difficulty} data-raid-boss-difficulty><span>{bossCopy.difficulty}</span><AtlasSegmented aria-label={bossCopy.difficulty} animation="spring" value={difficulty} onValueChange={value => setDifficulty(value as "normal" | "heroic")} options={(["normal", "heroic"] as const).map(value => ({ value, label: bossCopy[value] }))} /></div>}
    <RaidWorkspaceNavigation plan={plan} locale={locale} active={active} strip={strip} select={select} />
    <div className={styles.columns} data-raid-columns>
      <RaidPullMap plan={plan} active={active} locale={locale} onSelect={select} role={role} />
      <div ref={panel} className={styles.selected} id={`raid-pull-${plan.slug}`} data-raid-selected={pull.id}>
        <header className={styles.selectedHeader} data-raid-selected-header><div><small>{label} {active + 1} / {plan.pulls.length}{pull.area && <> · {pull.area[locale]}</>}</small><h3>{pull.title[locale]}</h3></div>
          <div className={styles.pager} data-raid-pager><AtlasButton size="sm" aria-label={encounter ? bossCopy.previous : t.previous} disabled={active === 0} onClick={() => select(active - 1)}><RaidPlannerTextMark slug={plan.slug} text="‹" fallback={<ChevronLeft aria-hidden="true" />} /></AtlasButton>
            <AtlasButton size="sm" aria-label={encounter ? bossCopy.next : t.next} disabled={active === plan.pulls.length - 1} onClick={() => select(active + 1)}><RaidPlannerTextMark slug={plan.slug} text="›" fallback={<ChevronRight aria-hidden="true" />} /></AtlasButton></div></header>
        <span className={styles.srOnly} role="status" aria-live="polite">{label} {active + 1}: {pull.title[locale]}</span>
        <RaidPullBriefing pull={pull} locale={locale} role={role} slug={plan.slug} encounter={encounter} difficulty={difficulty} spec={spec} />
      </div>
    </div>
    <RaidWorkspaceSources plan={plan} locale={locale} />
  </div>;
}

function RaidWorkspaceRoleToolbar({ plan, locale, role, onRoleChange, playerPicker }: WorkspaceProps & { role: RoleSelection; onRoleChange: (value: string) => void; playerPicker?: ReactNode }) {
  const t = raidPullCopy[locale];
  const roleCopy = pullRoleCopy[locale];
  const savedRole = plan.slug === "the-voidspire";
  return <>
    {savedRole ? <div className={styles.toolbar} data-raid-role-toolbar>
      <div className={glass.roleField}><span className={glass.fieldLabel}>{roleCopy.label}</span>
      <div data-raid-role-picker data-testid="pull-role-picker"><AtlasSegmented aria-label={roleCopy.label} aria-describedby="voidspire-role-hint" animation="spring" size="lg" fullWidth value={role} onValueChange={onRoleChange}
        options={(["all", "tank", "healer", "dps"] as const).map((value) => ({ value, label: t[value] }))} /></div></div>
      {playerPicker}
      <p id="voidspire-role-hint" data-raid-role-hint>{roleCopy.hint}</p>
    </div> : <div className={styles.toolbar} data-raid-role-toolbar><span>{t.role}</span><AtlasSegmented aria-label={t.role} value={role} onValueChange={onRoleChange}
      options={(["all", "tank", "healer", "dps"] as const).map((value) => ({ value, label: t[value] }))} /></div>}
  </>;
}

function RaidWorkspaceNavigation({ plan, locale, active, strip, select }: WorkspaceProps & { active: number; strip: RefObject<HTMLOListElement | null>; select: (index: number, reveal?: boolean) => void }) {
  const t = raidPullCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const encounter = Boolean(plan.encounter);
  const label = encounter ? bossCopy.phase : t.pull;
  const savedRole = plan.slug === "the-voidspire";
  return (
    <nav className={styles.pullNav} data-raid-pull-navigation aria-label={encounter ? bossCopy.phases : t.list}><ol ref={strip} className={styles.pullStrip}>{plan.pulls.map((item, index) => <li key={item.id}><button type="button"
      data-raid-pull-choice={index} aria-pressed={active === index} aria-controls={`raid-pull-${plan.slug}`} onClick={() => select(index, true)}>
      <b>{index + 1}</b><span><small>{encounter ? label : t[item.kind]}</small>{savedRole ? <span data-raid-pull-title>{item.title[locale]}</span> : item.title[locale]}</span></button></li>)}</ol><RaidPlannerPullPosition slug={plan.slug} label={label} current={active + 1} total={plan.pulls.length} /></nav>
  );
}

function RaidWorkspaceSources({ plan, locale }: WorkspaceProps) {
  const t = raidPullCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const encounter = Boolean(plan.encounter);
  const savedRole = plan.slug === "the-voidspire";
  return (
    <AtlasDisclosure summary={t.sources}>{encounter ? <p>{bossCopy.sourceNote}</p> : savedRole ? <p>{t.reviewedTrash}</p> : <><p>{t.interruptNote}</p><p>{plan.coverage === "route-draft" ? t.routeDraft : t.encounterCoverage}</p><p>{plan.note[locale]}</p></>}<ul className={styles.sources}>{[...plan.sources, ...(plan.atlas?.sources ?? []), ...(plan.atlas?.progression?.sources ?? [])].filter((source, i, entries) => entries.findIndex(s => s.url === source.url) === i).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></AtlasDisclosure>
  );
}
