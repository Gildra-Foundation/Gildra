"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { raidHubControlLayout } from "./raidHubControls";
import { raidCardThemes } from "./raidCardThemes";
import type { RaidHubSlug } from "./raidHubData";
import type { CSSProperties } from "react";
import { RaidPullMap } from "./RaidPullMap";
import { RaidPullBriefing } from "./RaidPullBriefing";
import { raidPullCopy } from "./raidPullCopy";
import type { RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import styles from "./raidPulls.module.css";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}
const readHash = () => window.location.hash;
const serverHash = () => "";

export function RaidPullWorkspace({ plan, locale }: { plan: RaidPullPlan; locale: "ru" | "en" }) {
  const t = raidPullCopy[locale];
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const active = Math.max(0, plan.pulls.findIndex((pull) => hash === `#raid-pull=${pull.id}`));
  const pull = plan.pulls[active];
  const [role, setRole] = useState<RaidPullRole | "all">("all");
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
  return <div className={styles.workspace} data-raid-pulls={plan.slug} style={{ ...raidHubControlLayout(slug), "--raid-card-accent": raidCardThemes[slug].accent } as CSSProperties}>
    <div className={styles.toolbar}><span>{t.role}</span><AtlasSegmented aria-label={t.role} value={role} onValueChange={(value) => setRole(value as RaidPullRole | "all")}
      options={(["all", "tank", "healer", "dps"] as const).map((value) => ({ value, label: t[value] }))} /></div>
    <nav className={styles.pullNav} aria-label={t.list}><ol ref={strip} className={styles.pullStrip}>{plan.pulls.map((item, index) => <li key={item.id}><button type="button"
      data-raid-pull-choice={index} aria-pressed={active === index} aria-controls={`raid-pull-${plan.slug}`} onClick={() => select(index, true)}>
      <b>{index + 1}</b><span><small>{t[item.kind]}</small>{item.title[locale]}</span></button></li>)}</ol></nav>
    <p className={styles.coverage} role="note">{plan.coverage === "route-draft" ? t.routeDraft : t.encounterCoverage}</p>
    <div className={styles.columns}>
      <RaidPullMap plan={plan} active={active} locale={locale} onSelect={select} />
      <div ref={panel} className={styles.selected} id={`raid-pull-${plan.slug}`} data-raid-selected={pull.id}>
        <header className={styles.selectedHeader}><div><small>{t.pull} {active + 1} / {plan.pulls.length}{pull.area && <> · {pull.area[locale]}</>}</small><h3>{pull.title[locale]}</h3></div>
          <div className={styles.pager}><AtlasButton size="sm" aria-label={t.previous} disabled={active === 0} onClick={() => select(active - 1)}><ChevronLeft aria-hidden="true" /></AtlasButton>
            <AtlasButton size="sm" aria-label={t.next} disabled={active === plan.pulls.length - 1} onClick={() => select(active + 1)}><ChevronRight aria-hidden="true" /></AtlasButton></div></header>
        <span className={styles.srOnly} role="status" aria-live="polite">{t.pull} {active + 1}: {pull.title[locale]}</span>
        <RaidPullBriefing pull={pull} locale={locale} role={role} slug={plan.slug} />
      </div>
    </div>
    <AtlasDisclosure summary={t.sources}><p>{t.interruptNote}</p><p>{plan.note[locale]}</p><ul className={styles.sources}>{plan.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></AtlasDisclosure>
  </div>;
}
