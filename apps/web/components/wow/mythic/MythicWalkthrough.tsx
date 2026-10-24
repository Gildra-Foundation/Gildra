"use client";
import { mythicWalkthroughCopy } from "./mythicWalkthroughCopy";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AtlasFrame, AtlasHero, AtlasSection, AtlasPanel, AtlasButton, AtlasSelect, AtlasField, AtlasAnchorNav, AtlasDisclosure } from "@/components/atlas";
import type { DungeonRoute, DungeonSelectorOption } from "./dungeonRoutes";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { wowRouteText } from "@/lib/wow/routeSourceLocale";
import { plainLanguage } from "./mythicRouteCopy";
import { mvpGuides, entranceSource } from "./mvpGuide";
import { mythicVerification } from "./mythicVerification";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import styles from "./mythicWalkthrough.module.css";

const routeVersion = "midnight-s2-20261019.2";
type Progress = { completed: number[]; notes: Record<number, string> };
const emptyProgress = (): Progress => ({ completed: [], notes: {} });
export function MythicWalkthrough({ locale, dungeon, dungeonOptions, combatIntel }: {
  locale: "en" | "ru"; dungeon: DungeonRoute; dungeonOptions: DungeonSelectorOption[]; combatIntel: DungeonCombatIntel;
}) {
  const ru = locale === "ru", prefix = ru ? "/ru" : "";
  const copy = mythicWalkthroughCopy[locale];
  const router = useRouter();
  const prose = (text: string) => ru ? plainLanguage(text) : text;
  const guide = mvpGuides[dungeon.slug];
  const name = wowSourceName(dungeon.name, locale, dungeon.nameRu);
  const [selectedId, setSelectedId] = useState(dungeon.stops[0].id);
  const [floor, setFloor] = useState(dungeon.stops[0].floor);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [message, setMessage] = useState("");
  const key = `gildra:mythic-walkthrough:${routeVersion}:${dungeon.slug}`;
  const selected = dungeon.stops.find(stop => stop.id === selectedId) ?? dungeon.stops[0];
  const index = dungeon.stops.findIndex(stop => stop.id === selected.id);
  useEffect(() => {
    const restoreLink = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("route") && params.get("route") !== routeVersion) setMessage(copy.routeVersionMismatch);
      const id = Number(params.get("step"));
      const stop = dungeon.stops.find(s => s.id === id) ?? dungeon.stops[0];
      setSelectedId(stop.id); setFloor(stop.floor);
    };
    restoreLink(); window.addEventListener("popstate", restoreLink);
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && Array.isArray(saved.completed) && saved.notes && typeof saved.notes === "object") {
        setProgress({ completed: saved.completed.filter((id: unknown) => dungeon.stops.some(s => s.id === id)), notes: Object.fromEntries(Object.entries(saved.notes).filter(([id, note]) => dungeon.stops.some(s => String(s.id) === id) && typeof note === "string").map(([id,note]) => [id, String(note).slice(0,4000)])) });
      }
    } catch { setStorageError(true); }
    setHydrated(true);
    return () => window.removeEventListener("popstate", restoreLink);
  }, [key, dungeon.stops, copy]);
  function select(id: number) {
    const stop = dungeon.stops.find(s => s.id === id); if (!stop) return;
    setSelectedId(id); setFloor(stop.floor);
    const url = new URL(window.location.href); url.searchParams.set("step", String(id));
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}`);
  }
  function save(next: Progress) {
    setProgress(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  async function share() {
    const url = new URL(`${prefix}/wow/mythic-plus/midnight-season-2/${dungeon.slug}`, window.location.origin);
    url.searchParams.set("step", String(selected.id)); url.searchParams.set("route", routeVersion);
    try { await navigator.clipboard.writeText(url.toString()); setMessage(copy.shareCopied); }
    catch { setMessage(copy.shareUnavailable); }
  }
  const visible = dungeon.stops.filter(s => s.floor === floor);
  const labels: Array<{ id: number; x: number; y: number }> = [];
  for (const stop of visible) {
    const candidates = [0, -11, 11, -22, 22, -33, 33, -44, 44].flatMap(dy => [0, -8, 8, -16, 16, -24, 24, -32, 32, -40, 40].map(dx => ({ id: stop.id, x: Math.max(4, Math.min(96, stop.x + dx)), y: Math.max(6, Math.min(94, stop.y + dy)) }))).sort((a, b) => Math.hypot(a.x - stop.x, a.y - stop.y) - Math.hypot(b.x - stop.x, b.y - stop.y));
    labels.push(candidates.find(candidate => labels.every(other => Math.hypot((candidate.x - other.x) * 6.8, (candidate.y - other.y) * 4.53) >= 48)) ?? candidates[0]);
  }
  const actions: Record<string, string> = ru ? { "Кик": "Прервать", "Стоп": "Контроль", "Диспел": "Снять эффект", "Пурж": "Рассеять усиление", "Уклонение": "Уклониться", "Защита": "Защита", "Фокус": "Приоритет урона" } : { "Кик": "Interrupt", "Стоп": "Crowd control", "Диспел": "Dispel", "Пурж": "Purge", "Уклонение": "Dodge", "Защита": "Defensive", "Фокус": "Damage priority" };
  const mechanicActions: Record<string, string> = ru ? {
    "Interrupting Cloudburst": "Прекратить чтение заклинаний", "Barrel Through": "Разделить урон", "Thunder and Lightning": "Разделить урон",
    "Rimeshatter": "Принять одному игроку", "Storm Blessed": "Сменить цель", "Boneslicer": "Снять стаки яда",
    "Spoiled Supplies": "Закрыть зону", "Corrupted Lifeforce": "Собрать сферы", "Murder in a Row": "Спрятаться за бочкой",
  } : {
    "Interrupting Cloudburst": "Stop casting", "Barrel Through": "Share damage", "Thunder and Lightning": "Share damage",
    "Rimeshatter": "One-player soak", "Storm Blessed": "Switch target", "Boneslicer": "Clear venom stacks",
    "Spoiled Supplies": "Soak the zone", "Corrupted Lifeforce": "Collect orbs", "Murder in a Row": "Hide behind a barrel",
  };
  return <AtlasFrame lang={locale} art={dungeon.backdropImage} still>
    <AtlasHero title={name} eyebrow={copy.currentSeason} lede={dungeon.description}
      breadcrumbs={[{ label: "World of Warcraft", href: `${prefix}/wow` }, { label: copy.mythicPlus, href: `${prefix}/wow/mythic-plus` }, { label: name }]}
      stats={[{ value: `${Math.floor(dungeon.timerSeconds/60)}:${String(dungeon.timerSeconds%60).padStart(2,"0")}`, label: copy.keystoneTimer }, { value: dungeon.stops.filter(s => s.kind === "boss").length, label: copy.bosses }]} />
    <div className={styles.toolbar}><AtlasField label={copy.dungeon} htmlFor="walkthrough-dungeon"><AtlasSelect id="walkthrough-dungeon" value={dungeon.slug} onChange={e => router.push(`${prefix}/wow/mythic-plus/midnight-season-2/${e.target.value}`)}>{dungeonOptions.map(d => <option key={d.slug} value={d.slug}>{ru ? d.nameRu : d.name}</option>)}</AtlasSelect></AtlasField><AtlasButton variant="secondary" onClick={() => void share()}>{copy.shareStep}</AtlasButton></div>
    {message && <p role="status">{message}</p>}
    <AtlasAnchorNav label={copy.contents} items={[{ href: "#route-overview", label: copy.entranceAndOrder }, { href: "#route-map", label: copy.map }, { href: "#route-step", label: copy.selectedStep }, { href: "#route-sources", label: copy.sources }]} />
    <AtlasSection id="route-overview" title={copy.entranceAndProgression}>
      <p>{prose(guide.entrance[locale])}</p><ol>{guide.stages[locale].map(stage => <li key={stage}>{prose(stage)}</li>)}</ol>
    </AtlasSection>
    <AtlasSection id="route-map" title={copy.mapAndWalkthrough}>
      <div className={styles.workspace}>
        <div className={styles.mapColumn}>
          <AtlasField label={copy.selectedStep} htmlFor="walkthrough-step">
            <AtlasSelect id="walkthrough-step" value={selected.id} onChange={event => select(Number(event.target.value))}>
              {dungeon.stops.map(stop => <option key={stop.id} value={stop.id}>{stop.id}. {wowRouteText(stop.title, locale)}</option>)}
            </AtlasSelect>
          </AtlasField>
          <div className={styles.toolbar} role="group" aria-label={copy.floor}>{dungeon.floors.map(f => <AtlasButton key={f.id} variant="secondary" aria-pressed={floor === f.id} onClick={() => setFloor(f.id)}>{f.label}</AtlasButton>)}</div>
          <div className={styles.mapScroll} tabIndex={0} role="region" aria-label={copy.scrollMap}>
            <div className={styles.map}>
              <Image src={dungeon.mapImage} alt={ru ? `Карта: ${name}` : `Map: ${name}`} width={1002} height={668} sizes="(max-width: 1100px) 680px, 60vw" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={visible.map(s => `${s.x},${s.y}`).join(" ")} />{visible.map((s,i) => <line key={s.id} x1={s.x} y1={s.y} x2={labels[i].x} y2={labels[i].y} />)}</svg>
              {visible.map((s,i) => <button key={s.id} className={styles.marker} style={{ left: `${labels[i].x}%`, top: `${labels[i].y}%` }} type="button" data-active={s.id === selected.id} data-done={progress.completed.includes(s.id)} aria-label={`${s.id}. ${wowRouteText(s.title, locale)}`} aria-pressed={s.id === selected.id} onClick={() => select(s.id)}>{s.id}</button>)}
            </div>
          </div>

        </div>
        <AtlasPanel id="route-step" className={styles.detail}>
          <p className={styles.eyebrow}>{copy.step} {index+1} / {dungeon.stops.length}</p>
          <h2>{wowRouteText(selected.title, locale)}</h2><p>{prose(selected.summary)}</p>
          {dungeon.routeEvidence && <p>{copy.enemyForces}: {selected.forces.toFixed(2)}% · {copy.afterStep} {selected.cumulative.toFixed(2)}%</p>}
          <ul>{selected.enemies.map(enemy => <li key={enemy.name}>{enemy.count} × {wowRouteText(enemy.name, locale)}</li>)}</ul>
          <ul>{selected.callouts.map((text,i) => <li key={i}>{prose(text)}</li>)}</ul>
          <h3>{copy.roleAssignments}</h3>
          <dl className={styles.roles}>{(["tank", "healer", "dps"] as const).map(role => <div key={role}><dt>{role === "tank" ? copy.tank : role === "healer" ? copy.healer : copy.damage}</dt><dd>{prose(selected[role])}</dd></div>)}</dl>
          {selected.abilities.length > 0 && <><h3>{copy.dangerousAbilities}</h3><ul className={styles.abilities}>{selected.abilities.map((a,i) => {
            const media = combatIntel.abilities[a.name]?.media;
            return <li key={i}><strong>{media?.exact && media.media.spellId ? <a href={`https://www.wowhead.com/spell=${media.media.spellId}`} target="_blank" rel="noreferrer">{wowRouteText(a.name, locale)}</a> : wowRouteText(a.name, locale)}</strong><span>{mechanicActions[a.name] ?? actions[a.action]}</span>{ru && wowRouteText(a.name, locale) !== a.name && <small lang="en">{a.name}</small>}{a.source && <small>{wowRouteText(a.source, locale)}</small>}</li>;
          })}</ul></>}
          <label className={styles.complete}><input type="checkbox" disabled={!hydrated} checked={progress.completed.includes(selected.id)} onChange={e => save({ ...progress, completed: e.target.checked ? [...progress.completed, selected.id] : progress.completed.filter(id => id !== selected.id) })} />{copy.stepCompleted}</label>
          <label className={styles.note}>{copy.personalNote}<textarea rows={4} maxLength={4000} disabled={!hydrated} value={progress.notes[selected.id] ?? ""} onChange={e => save({ ...progress, notes: { ...progress.notes, [selected.id]: e.target.value } })} /></label>
          <p role={storageError ? "alert" : "status"}>{storageError ? copy.storageFailed : hydrated ? copy.progressSaved : copy.loadingNotes}</p>
          <div className={styles.toolbar}><AtlasButton variant="secondary" disabled={index === 0} onClick={() => select(dungeon.stops[index-1].id)}>{copy.previous}</AtlasButton><AtlasButton disabled={index === dungeon.stops.length-1} onClick={() => select(dungeon.stops[index+1].id)}>{copy.nextStep}</AtlasButton></div>
        </AtlasPanel>
          <ol className={styles.steps}>{dungeon.stops.map(s => <li key={s.id}><button type="button" aria-current={selected.id === s.id ? "step" : undefined} onClick={() => select(s.id)}><span>{progress.completed.includes(s.id) ? "✓" : s.id}</span><span>{wowRouteText(s.title, locale)}</span></button></li>)}</ol>
      </div>
    </AtlasSection>
    <AtlasSection className={styles.sourceSection} id="route-sources" title={copy.sources}><AtlasDisclosure summary={copy.sourceDetails}>{dungeon.routeEvidence && <p>{copy.routeComposition}: Tactyks {dungeon.routeEvidence.sourceVersion} · <a href={dungeon.routeEvidence.mapSource} target="_blank" rel="noreferrer">MDT</a> · {dungeon.routeEvidence.verifiedAt}. {copy.enemyForces}: {dungeon.routeEvidence.totalForces}/{dungeon.routeEvidence.requiredForces}.{dungeon.routeEvidence.adjusted && (copy.updatedPacks)}</p>}<ul className={styles.sources}><li><a href={entranceSource} target="_blank" rel="noreferrer">Method · {copy.dungeonEntrances}</a></li><li><a href={dungeon.guideUrl} target="_blank" rel="noreferrer">{new URL(dungeon.guideUrl).hostname === "www.wowhead.com" ? "Wowhead" : "Icy Veins"} · {name}</a></li><li><a href={`https://www.method.gg/guides/dungeons/${dungeon.slug}`} target="_blank" rel="noreferrer">Method · Tactyks</a> · <a href={dungeon.mdtRouteUrl} target="_blank" rel="noreferrer">{copy.authorRoute}</a></li><li><a href={mythicVerification.timers.source} target="_blank" rel="noreferrer">Raider.IO · {copy.timers}</a> · {mythicVerification.timers.checkedAt}</li><li><Link href={`${prefix}/wow/mythic-plus`}>{copy.allDungeons}</Link></li></ul></AtlasDisclosure></AtlasSection>
  </AtlasFrame>;
}
