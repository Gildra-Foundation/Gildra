"use client";

import { ResilientImage } from "@/components/media/ResilientImage";
import { dungeonArtDirections, dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Skull } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasChoiceHighlight } from "@gildra/atlas-ui/AtlasChoiceHighlight";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { PlayerProfilePicker } from "./PlayerProfilePicker";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { usePlayerProfile } from "./usePlayerProfile";
import { playerSpecs, talentsForProfile } from "./playerTools";
import { TalentImportPanel } from "./TalentImportPanel";
import { usePullRole } from "./usePullRole";
import { pullRoleCopy } from "./pullRoleCopy";
import type { MdtDataset } from "@/lib/data/wow/mythicReview.types";
import type { RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { buildMdtPullIntel } from "./mdtPullIntel";
import { MdtPullDetails } from "./MdtPullDetails";
import { DungeonSourceReview } from "./DungeonSourceReview";
import { PullActionPanel } from "./PullActionPanel";
import { pullMapModel, pullPosition } from "./pullMapModel";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { mdtPullMapCopy } from "./mdtPullMapCopy";
import { pullWorkspaceCopy } from "./pullWorkspaceCopy";
import { dungeonMapFrameLayout } from "./dungeonMapFrameLayout";
import { dungeonThemeClass } from "./dungeonTheme";
import { dungeonPullArtClass } from "./dungeonPullArt";
import styles from "./mdtPullMap.module.css";

export default function MdtPullMap({ slug, locale, routeUrl, data, stops, combatIntel }: { slug: DungeonSlug; locale: "ru" | "en"; routeUrl: string; data: MdtDataset; stops: RouteStop[]; combatIntel: DungeonCombatIntel }) {
  const copy = mdtPullMapCopy[locale], t = pullWorkspaceCopy[locale], roles = pullRoleCopy[locale];
  const [selectedRole, setSelectedRole] = usePullRole();
  const [profile, setProfile] = usePlayerProfile();
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const pullStrip = useRef<HTMLOListElement>(null);
  const [pullList, setPullList] = useState<HTMLOListElement | null>(null);
  const attachPullStrip = useCallback((node: HTMLOListElement | null) => { pullStrip.current = node; setPullList(node); }, []);
  const root = useRef<HTMLElement>(null), builds = useRef<HTMLDetailsElement>(null);
  const themeClassName = `${dungeonThemeClass(slug)} ${dungeonPullArtClass(slug)}`;
  const selectedSpec = playerSpecs.find(spec => spec.id === profile.specId && spec.classId === profile.classId);
  const activeRole = selectedSpec?.role ?? selectedRole;
  const talents = useMemo(() => talentsForProfile({ classId: profile.classId, specId: profile.specId, talentString: profile.talentString }), [profile.classId, profile.specId, profile.talentString]);
  const { authored, pulls, floors } = useMemo(() => pullMapModel(data), [data]);
  const pullIntel = useMemo(() => pulls.map(members => buildMdtPullIntel(members, stops, combatIntel, locale)), [pulls, stops, combatIntel, locale]);
  const label = authored ? copy.pull : copy.group;
  const active = Math.min(selected, Math.max(0, pulls.length - 1));
  const members = pulls[active];
  const title = `${label} ${active + 1}`;
  const forcesPercent = (forces: number) => data.total > 0 ? `${(forces / data.total * 100).toFixed(1)}%` : "—";
  useEffect(() => {
    const revealBuild = () => { if (window.location.hash.startsWith("#mythic-build=") && builds.current) builds.current.open = true; };
    revealBuild(); window.addEventListener("hashchange", revealBuild);
    return () => window.removeEventListener("hashchange", revealBuild);
  }, []);
  const revealMarker = useCallback((index: number, animate = false) => {
    const marker = root.current?.querySelector<HTMLElement>(`[data-testid="mdt-pull-marker"][data-pull-index="${index}"]`);
    const viewport = marker?.closest<HTMLElement>("[data-map-viewport]");
    if (marker && viewport) viewport.scrollTo({ left: marker.offsetLeft - viewport.clientWidth / 2, top: marker.offsetTop - viewport.clientHeight / 2, behavior: animate && !lessMotion() ? "smooth" : "instant" });
  }, []);
  useEffect(() => {
    // On a phone the initial camera must show the initially selected pull too.
    const frame = requestAnimationFrame(() => revealMarker(0));
    return () => cancelAnimationFrame(frame);
  }, [revealMarker]);
  function selectPull(index: number, reveal = false) {
    setSelected(index);
    requestAnimationFrame(() => {
      if (reveal) revealMarker(index, true);
      const choice = root.current?.querySelector<HTMLElement>(`[data-pull-choice="${index}"]`);
      const strip = choice?.closest<HTMLElement>("[data-pull-strip]");
      if (choice && strip) strip.scrollTo({ left: strip.scrollLeft + choice.getBoundingClientRect().left - strip.getBoundingClientRect().left - strip.clientWidth / 2 + choice.clientWidth / 2, behavior: !lessMotion() ? "smooth" : "instant" });
    });
  }
  return <section ref={root} className={`${styles.panel} ${dungeonPullArtClass(slug)}`} data-dungeon-map={slug} data-testid="mdt-map" aria-label={copy.mapLabel}>
    <header className={styles.header}><h3>{authored ? t.route : t.groups}</h3><a className={styles.routeLink} href={data.route.url || routeUrl} target="_blank" rel="noreferrer">{copy.authoredRoute}</a></header>
    <div className={styles.playerBar}>
      <div className={styles.rolePicker} data-testid="pull-role-picker"><AtlasSegmented aria-label={roles.label} animation="spring" size="lg" fullWidth value={activeRole} onValueChange={value => { setProfile({ ...profile, specId: null }); setSelectedRole(value); }} options={(["all", "tank", "healer", "dps"] as const).map(value => ({ value, label: roles[value] }))} /></div>
      <PlayerProfilePicker locale={locale} themeClassName={themeClassName} profile={profile} onProfileChange={setProfile} onRoleChange={setSelectedRole} />
      <details ref={builds} className={styles.buildDisclosure}><summary data-pull-art-control="material">{t.build}<span>{talents.selection ? t.imported : t.options}</span></summary><TalentImportPanel locale={locale} profile={profile} result={talents.result} onProfileChange={setProfile} onRoleChange={setSelectedRole} /></details>
    </div>
    {!authored && <p className={styles.routeStatus} data-testid="mdt-route-status">{t.unverified} · {copy.incompatible}</p>}
    {!members ? <p role="status">{copy.empty}</p> : <>
      <nav className={styles.pullNav} aria-label={authored ? t.poolList : t.groupList}>
        <ol ref={attachPullStrip} className={styles.pullStrip} data-pull-strip
          onPointerOver={event => { if (event.pointerType === "mouse") { const choice = (event.target as HTMLElement).closest<HTMLElement>("[data-pull-choice]"); if (choice) setPreview(Number(choice.dataset.pullChoice)); } }}
          onPointerLeave={() => setPreview(null)}
          onFocusCapture={event => { const choice = (event.target as HTMLElement).closest<HTMLElement>("[data-pull-choice]"); if (choice?.matches(":focus-visible")) setPreview(Number(choice.dataset.pullChoice)); }}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null); }}>{pulls.map((group, index) => <li key={group.map(node => node.id).join(",")}><button type="button" data-pull-choice={index} aria-pressed={active === index} aria-controls="pull-selected-panel" onClick={() => selectPull(index, true)} aria-label={`${label} ${index + 1}: ${copy.enemyCount(group.length)}`}>
          <b>{index + 1}</b><span>{group.every(node => node.boss) ? <><Skull size={14} aria-hidden="true" /> {t.boss}</> : copy.enemyCount(group.length)}</span>
        </button></li>)}{pullList && <li className={styles.pullHighlights} role="presentation" aria-hidden="true">
          <AtlasChoiceHighlight listRef={pullStrip} activeKey={active} selector={`[data-pull-choice="${active}"]`} name="selected" className={styles.selectionHighlight} />
          <AtlasChoiceHighlight listRef={pullStrip} activeKey={preview ?? active} selector={`[data-pull-choice="${preview ?? active}"]`} name="hover" visible={preview !== null} className={styles.hoverHighlight} />
        </li>}</ol>
      </nav>
      <div className={styles.workspace}>
        <div className={styles.maps}>{floors.map(floor => <figure className={styles.floor} key={floor} data-map-frame={`${slug}-mdt-${floor}`} data-frame-motif={dungeonArtDirections[slug].motif}>
          {floors.length > 1 && <figcaption>{copy.floor} {floor}</figcaption>}
          <div className={styles.mapFrame} style={dungeonMapFrameLayout(slug)}>{<ResilientImage className={styles.frameArtwork} src={dungeonFrameArtwork(slug)} width={1536} height={1024} alt="" aria-hidden="true" />}<div className={styles.viewport} data-map-viewport tabIndex={0} role="region" aria-label={`${copy.mapLabel} · ${copy.floor} ${floor}`}>
            <div className={styles.map}>
              {/* Keep original MDT pixels and marker coordinates in the same 3:2 plane. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.image} alt={copy.mapAlt} width={1680} height={1120} />
              {pulls.map((group, index) => {
                const position = pullPosition(group, floor);
                if (!position) return null;
                return <MdtPullDetails themeClassName={themeClassName} key={group.map(node => node.id).join(",")} onSelect={() => selectPull(index)} title={`${label} ${index + 1} · ${copy.enemyCount(group.length)}`} intel={pullIntel[index]} locale={locale} selectedRole={activeRole} selectedSpec={selectedSpec} selectedSpells={talents.selection}>
                  <button type="button" className={styles.marker} data-testid="mdt-pull-marker" data-pull-index={index} data-boss={position.boss || undefined} aria-pressed={active === index} aria-controls="pull-selected-panel" style={{ left: `${position.x}%`, top: `${position.y}%` }} aria-label={`${label} ${index + 1}: ${copy.enemyCount(position.count)}${position.boss ? ` · ${copy.boss}` : ""}`}>
                    <strong aria-hidden="true">{index + 1}</strong><span className={styles.markerCount} aria-hidden="true">{position.boss ? <Skull size={13} /> : `×${position.count}`}</span>
                  </button>
                </MdtPullDetails>;
              })}
            </div>
          </div></div>
        </figure>)}</div>
        <aside id="pull-selected-panel" className={styles.selectedPanel} data-testid="pull-selected-panel" aria-label={title}>
          <header className={styles.selectedHeader}>
            <div className={styles.selectedIdentity}><b className={styles.selectedNumber} data-pull-art-emblem aria-hidden="true">{active + 1}</b><div><h4 aria-live="polite" aria-atomic="true">{title}</h4><span>{copy.enemyCount(members.length)} · {t.forces} {forcesPercent(members.reduce((sum, node) => sum + node.forces, 0))}</span></div></div>
            <div className={styles.pullArrows}><AtlasButton data-pull-art-control="icon" size="sm" variant="ghost" disabled={active === 0} aria-label={`${t.previous} ${label.toLocaleLowerCase(locale)}`} onClick={() => selectPull(active - 1, true)}><ChevronLeft size={20} aria-hidden="true" /></AtlasButton><AtlasButton data-pull-art-control="icon" size="sm" variant="ghost" disabled={active === pulls.length - 1} aria-label={`${t.next} ${label.toLocaleLowerCase(locale)}`} onClick={() => selectPull(active + 1, true)}><ChevronRight size={20} aria-hidden="true" /></AtlasButton></div>
          </header>
          <div className={styles.selectedBody} key={active}><PullActionPanel themeClassName={themeClassName} title={title} intel={pullIntel[active]} locale={locale} role={activeRole} spec={selectedSpec} spells={talents.selection} /></div>
        </aside>
      </div>
    </>}
    <details className={styles.details}><summary>{t.sourcesNotes}</summary><p>{authored ? copy.matched(data.route.author, data.route.name) : copy.incompatible}</p><p>{copy.notice}</p><p>{copy.forcesNotice}</p>{data.route.notes.length > 0 && <><h4>{copy.authorNotes}</h4><ul>{data.route.notes.map(note => <li key={note.en}>{note[locale]}</li>)}</ul></>}{<DungeonSourceReview review={combatIntel.review} locale={locale} />}<p className={styles.source}><a href={data.source} target="_blank" rel="noreferrer">{copy.source}</a> · <time dateTime={data.checkedAt}>{data.checkedAt}</time></p></details>
  </section>;
}
