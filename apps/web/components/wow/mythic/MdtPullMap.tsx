"use client";

import { ResilientImage } from "@/components/media/ResilientImage";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { dungeonMapFrame, dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Skull } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { usePlayerProfile } from "./usePlayerProfile";
import { playerClasses, playerSpecs, talentsForProfile } from "./playerTools";
import { TalentImportPanel } from "./TalentImportPanel";
import { playerToolsCopy } from "./playerToolsCopy";
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
import styles from "./mdtPullMap.module.css";

export default function MdtPullMap({ slug, locale, routeUrl, data, stops, combatIntel }: { slug: DungeonSlug; locale: "ru" | "en"; routeUrl: string; data: MdtDataset; stops: RouteStop[]; combatIntel: DungeonCombatIntel }) {
  const copy = mdtPullMapCopy[locale], t = pullWorkspaceCopy[locale], roles = pullRoleCopy[locale], playerCopy = playerToolsCopy[locale];
  const [selectedRole, setSelectedRole] = usePullRole();
  const [profile, setProfile] = usePlayerProfile();
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLElement>(null), builds = useRef<HTMLDetailsElement>(null);
  const ruby = slug === "ruby-life-pools";
  const specTheme = talentSpecThemes.find(spec => spec.specId === profile.specId && spec.classId === profile.classId);
  const classTheme = talentSpecThemes.find(spec => spec.classId === profile.classId);
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
  function revealMarker(index: number) {
    const marker = root.current?.querySelector<HTMLElement>(`[data-testid="mdt-pull-marker"][data-pull-index="${index}"]`);
    const viewport = marker?.closest<HTMLElement>("[data-map-viewport]");
    if (marker && viewport) viewport.scrollTo({ left: marker.offsetLeft - viewport.clientWidth / 2, top: marker.offsetTop - viewport.clientHeight / 2, behavior: "instant" });
  }
  useEffect(() => {
    // On a phone the initial camera must show the initially selected pull too.
    const frame = requestAnimationFrame(() => revealMarker(0));
    return () => cancelAnimationFrame(frame);
  }, []);
  function selectPull(index: number, reveal = false) {
    setSelected(index);
    requestAnimationFrame(() => {
      if (reveal) revealMarker(index);
      const choice = root.current?.querySelector<HTMLElement>(`[data-pull-choice="${index}"]`);
      const strip = choice?.closest<HTMLElement>("[data-pull-strip]");
      if (choice && strip) strip.scrollTo({ left: strip.scrollLeft + choice.getBoundingClientRect().left - strip.getBoundingClientRect().left - strip.clientWidth / 2 + choice.clientWidth / 2, behavior: "instant" });
    });
  }
  return <section ref={root} className={styles.panel} data-dungeon-map={slug} data-testid="mdt-map" aria-label={copy.mapLabel}>
    <header className={styles.header}><h3>{authored ? t.route : t.groups}</h3><a className={styles.routeLink} href={data.route.url || routeUrl} target="_blank" rel="noreferrer">{copy.authoredRoute}</a></header>
    <div className={styles.playerBar}>
      <div className={styles.rolePicker} data-testid="pull-role-picker"><AtlasSegmented aria-label={roles.label} size="lg" fullWidth value={activeRole} onValueChange={value => { setProfile({ ...profile, specId: null }); setSelectedRole(value); }} options={(["all", "tank", "healer", "dps"] as const).map(value => ({ value, label: roles[value] }))} /></div>
      <div className={styles.profileFields} data-testid="pull-player-picker">
        <label><span>{playerCopy.classLabel}</span>{ruby && classTheme && <ResilientImage className={styles.pickerIcon} src={classTheme.classIconUrl} width={30} height={30} alt="" />}<AtlasValyroSelect native size="lg" placeholder={playerCopy.noClass} aria-label={playerCopy.classLabel} value={profile.classId?.toString() ?? ""} onValueChange={value => setProfile({ classId: Number(value) || null, specId: null })} options={[{ value: "", label: playerCopy.noClass }, ...playerClasses.map(entry => ({ value: String(entry.id), label: entry.name[locale] }))]} /></label>
        <label><span>{playerCopy.specLabel}</span>{ruby && specTheme && <ResilientImage className={styles.pickerIcon} src={specTheme.iconUrl} width={30} height={30} alt="" />}<AtlasValyroSelect native size="lg" placeholder={profile.classId ? playerCopy.noSpec : playerCopy.selectClass} aria-label={playerCopy.specLabel} disabled={!profile.classId} value={profile.specId?.toString() ?? ""} onValueChange={value => { const spec = playerSpecs.find(entry => entry.id === Number(value) && entry.classId === profile.classId); setProfile({ classId: profile.classId, specId: spec?.id ?? null }); if (spec) setSelectedRole(spec.role); }} options={[{ value: "", label: profile.classId ? playerCopy.noSpec : playerCopy.selectClass }, ...playerSpecs.filter(entry => entry.classId === profile.classId).map(entry => ({ value: String(entry.id), label: entry.name[locale] }))]} /></label>
      </div>
      <details ref={builds} className={styles.buildDisclosure}><summary>{t.build}<span>{talents.selection ? t.imported : t.options}</span></summary><TalentImportPanel locale={locale} profile={profile} result={talents.result} onProfileChange={setProfile} onRoleChange={setSelectedRole} /></details>
    </div>
    {!authored && <p className={styles.routeStatus} data-testid="mdt-route-status">{t.unverified} · {copy.incompatible}</p>}
    {!members ? <p role="status">{copy.empty}</p> : <>
      <nav className={styles.pullNav} aria-label={authored ? t.poolList : t.groupList}>
        <ol className={styles.pullStrip} data-pull-strip>{pulls.map((group, index) => <li key={group.map(node => node.id).join(",")}><button type="button" data-pull-choice={index} aria-pressed={active === index} aria-controls="pull-selected-panel" onClick={() => selectPull(index, true)} aria-label={`${label} ${index + 1}: ${copy.enemyCount(group.length)}`}>
          <b>{index + 1}</b><span>{group.every(node => node.boss) ? <><Skull size={14} aria-hidden="true" /> {t.boss}</> : copy.enemyCount(group.length)}</span>
        </button></li>)}</ol>
      </nav>
      <div className={styles.workspace}>
        <div className={styles.maps}>{floors.map(floor => <figure className={styles.floor} key={floor} data-map-frame={`${slug}-mdt-${floor}`} data-frame-motif={dungeonArtDirections[slug].motif}>
          {floors.length > 1 && <figcaption>{copy.floor} {floor}</figcaption>}
          <div className={styles.mapFrame} style={{ "--map-frame": `url("${dungeonMapFrame(slug, "mdt", floor)}")` } as CSSProperties}>{ruby && <ResilientImage className={styles.frameArtwork} src="/assets/wow/mythic/ruby-sanctuary/map-frame.webp" width={1536} height={1024} alt="" aria-hidden="true" />}<div className={styles.viewport} data-map-viewport tabIndex={0} role="region" aria-label={`${copy.mapLabel} · ${copy.floor} ${floor}`}>
            <div className={styles.map}>
              {/* Keep original MDT pixels and marker coordinates in the same 3:2 plane. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.image} alt={copy.mapAlt} width={1680} height={1120} />
              {pulls.map((group, index) => {
                const position = pullPosition(group, floor);
                if (!position) return null;
                return <MdtPullDetails ruby={ruby} key={group.map(node => node.id).join(",")} onSelect={() => selectPull(index)} title={`${label} ${index + 1} · ${copy.enemyCount(group.length)}`} intel={pullIntel[index]} locale={locale} selectedRole={activeRole} selectedSpec={selectedSpec} selectedSpells={talents.selection}>
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
            <div className={styles.selectedIdentity}><b className={styles.selectedNumber} aria-hidden="true">{active + 1}</b><div><h4 aria-live="polite" aria-atomic="true">{title}</h4><span>{copy.enemyCount(members.length)} · {t.forces} {forcesPercent(members.reduce((sum, node) => sum + node.forces, 0))}</span></div></div>
            <div className={styles.pullArrows}><AtlasButton size="sm" variant="ghost" disabled={active === 0} aria-label={`${t.previous} ${label.toLocaleLowerCase(locale)}`} onClick={() => selectPull(active - 1, true)}><ChevronLeft size={20} aria-hidden="true" /></AtlasButton><AtlasButton size="sm" variant="ghost" disabled={active === pulls.length - 1} aria-label={`${t.next} ${label.toLocaleLowerCase(locale)}`} onClick={() => selectPull(active + 1, true)}><ChevronRight size={20} aria-hidden="true" /></AtlasButton></div>
          </header>
          <div className={styles.selectedBody} key={active}><PullActionPanel ruby={ruby} title={title} intel={pullIntel[active]} locale={locale} role={activeRole} spec={selectedSpec} spells={talents.selection} /></div>
        </aside>
      </div>
    </>}
    <details className={styles.details}><summary>{ruby ? t.sourcesNotes : copy.details}</summary><p>{authored ? copy.matched(data.route.author, data.route.name) : copy.incompatible}</p><p>{copy.notice}</p><p>{copy.forcesNotice}</p>{data.route.notes.length > 0 && <><h4>{copy.authorNotes}</h4><ul>{data.route.notes.map(note => <li key={note.en}>{note[locale]}</li>)}</ul></>}{ruby && <DungeonSourceReview review={combatIntel.review} locale={locale} />}<p className={styles.source}><a href={data.source} target="_blank" rel="noreferrer">{copy.source}</a> · <time dateTime={data.checkedAt}>{data.checkedAt}</time></p></details>
  </section>;
}
