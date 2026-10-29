"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Layers, Route, Skull } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import type { RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import { RaidBossDiagram } from "./RaidBossDiagram";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import { RaidSchematicMap } from "./RaidSchematicMap";
import { RaidCartography } from "./RaidCartography";
import { RaidPullRouteList } from "./RaidPullRouteList";
import { raidPullRouteCopy } from "./raidPullRouteCopy";
import { raidMapCopy } from "./raidMapCopy";
import { RaidPlannerIcon } from "./VoidspirePlannerArt";
import { backgroundKey, mapBackground, readMapPreference, saveMapPreference, subscribeMapPreferences, type RaidMapBackground } from "./raidMapPreferences";
import styles from "./raidMap.module.css";

function resolveRaidMapView(plan: RaidPullPlan, pull: RaidPullPlan["pulls"][number], floorChoice: { pull: string; id: string }, arenaChoice: { pull: string; boss: string; variant: string }, background: RaidMapBackground) {
  const atlas = plan.atlas;
  const selectionId = plan.encounter?.bossSlug ?? pull.id;
  const bosses = plan.bosses.length ? plan.bosses : plan.pulls.filter(item => item.bossSlug).map(item => ({ slug: item.bossSlug!, name: item.title, artwork: item.enemies[0]?.artwork, x: item.x, y: item.y }));
  const defaultBoss = pull.bossSlug ?? bosses[0]?.slug ?? "";
  const arenaBoss = arenaChoice.pull === selectionId ? arenaChoice.boss : defaultBoss;
  const variants = atlas?.arenas[arenaBoss] ?? [];
  const arena = variants.find(variant => arenaChoice.pull === selectionId && variant.id === arenaChoice.variant) ?? variants[0];
  const defaultFloor = atlas?.floors.find(item => item.pins.some(pin => pin.bossSlug === defaultBoss)) ?? atlas?.floors[0];
  const floor = atlas?.floors.find(item => floorChoice.pull === selectionId && item.id === floorChoice.id) ?? defaultFloor;
  return { bosses, defaultBoss, arenaBoss, variants, arena, floor, image: background === "arena" ? arena : floor, pins: background === "map" ? floor?.pins ?? [] : [] };
}

export function RaidPullMap({ plan, active, locale, onSelect, role = "all" }: { plan: RaidPullPlan; active: number; locale: "ru" | "en"; onSelect: (index: number, reveal?: boolean) => void; role?: RaidPullRole | "all" }) {
  const t = raidMapCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const atlas = plan.atlas;
  const pull = plan.pulls[active];
  const preferenceKey = plan.encounter ? `${backgroundKey}:${plan.encounter.bossSlug}` : backgroundKey;
  const initialBackground = plan.encounter ? "arena" : "map";
  const selectionId = plan.encounter?.bossSlug ?? pull.id;
  const preference = useSyncExternalStore(subscribeMapPreferences, () => readMapPreference(preferenceKey, initialBackground), () => initialBackground);
  const background = atlas ? mapBackground(preference) : "grid";
  const [floorChoice, setFloorChoice] = useState({ pull: "", id: "" });
  const [arenaChoice, setArenaChoice] = useState({ pull: "", boss: "", variant: "" });
  const { bosses, defaultBoss, arenaBoss, variants, arena, floor, image, pins } = resolveRaidMapView(plan, pull, floorChoice, arenaChoice, background);
  const progression = atlas?.progression;
  const groupedArena = background === "arena" && plan.slug === "the-voidspire" && !plan.encounter;
  const fields = <RaidMapFields plan={plan} locale={locale} background={background === "arena" ? "arena" : "map"} active={active}
    view={{ bosses, defaultBoss, arenaBoss, variants, arena, floor, image, pins }} onFloor={id => setFloorChoice({ pull: selectionId, id })}
    onBoss={boss => setArenaChoice({ pull: selectionId, boss, variant: "" })} onPull={index => onSelect(index)}
    onVariant={variant => setArenaChoice({ pull: selectionId, boss: arenaBoss, variant })} />;
  return <section className={styles.studio} data-raid-map-studio data-background={background} aria-label={t.background}>
    <div className={styles.backgrounds}><AtlasSegmented className={styles.materialModes} data-raid-map-modes aria-label={t.background} value={background}
      onValueChange={value => saveMapPreference(preferenceKey, value)}
      options={(["map", "arena", "grid", "art"] as const).map(value => ({ value, label: plan.encounter && (value === "grid" || value === "art") ? bossCopy[value] : t[value], icon: plan.slug === "the-voidspire" ? <RaidPlannerIcon slug={plan.slug} kind={value} /> : undefined, disabled: !atlas && (value === "map" || value === "arena") }))} /></div>
    {(background === "grid" || background === "art") ? (plan.encounter ? <RaidBossDiagram plan={plan} active={active} locale={locale} role={role} background={background} /> : <RaidSchematicMap plan={plan} active={active} locale={locale} onSelect={onSelect} background={background} />) : image && <>
      {!groupedArena && fields}
      <RaidCartography key={`${background}:${groupedArena ? "pull-selector" : image.src}${plan.encounter ? `:${pull.id}` : ""}`} plan={plan} image={image} background={background}
        pins={pins} bosses={bosses} activeBoss={background === "arena" ? arenaBoss : defaultBoss}
        activePull={active} onSelectPull={onSelect}
        links={progression?.links ?? []} locale={locale} controls={groupedArena ? fields : undefined} sketchScope={plan.encounter ? pull.id : undefined} />
    </>}
    <RaidPullRouteList plan={plan} active={active} locale={locale} onSelect={onSelect} />
    <RaidMapProgression plan={plan} locale={locale} bosses={bosses} defaultBoss={defaultBoss} />
    <p className={styles.attribution}><span>{t.sources} · © Blizzard Entertainment</span><a href="https://raidplan.io" target="_blank" rel="noreferrer">RaidPlan<ArrowUpRight size={12} aria-hidden="true" /></a></p>
  </section>;
}

function RaidMapFields({ plan, locale, background, active, view, onFloor, onBoss, onPull, onVariant }: { plan: RaidPullPlan; locale: "ru" | "en"; background: "map" | "arena"; active: number; view: ReturnType<typeof resolveRaidMapView>; onFloor: (id: string) => void; onBoss: (slug: string) => void; onPull: (index: number) => void; onVariant: (id: string) => void }) {
  const t = raidMapCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const atlas = plan.atlas;
  const copy = raidPullRouteCopy[locale];
  const groupedArena = background === "arena" && plan.slug === "the-voidspire" && !plan.encounter;
  const { bosses, arenaBoss, variants, arena, floor } = view;
  if (background === "map" && atlas!.floors.length < 2) return null;
  if (plan.encounter && background === "arena" && variants.length < 2) return null;
  return (
      <div className={`${styles.selectors} ${groupedArena ? styles.arenaFields : ""}`} data-raid-map-fields>
        {background === "map" ? <div className={styles.field}><span><RaidPlannerIcon slug={plan.slug} kind="map" fallback={<Layers size={15} aria-hidden="true" />} />{t.floor}</span><AtlasValyroSelect aria-label={t.floor} className={styles.assetSelect} data-raid-map-select
          value={floor?.id} options={atlas!.floors.map(f => ({ value: f.id, label: f.name[locale] }))}
          onValueChange={id => onFloor(id)} /></div> : <>
          {groupedArena && <div className={styles.field}><span>{copy.arenaSelect}</span><AtlasValyroSelect aria-label={copy.arenaSelect} className={styles.assetSelect} data-raid-arena-pull-select
            value={plan.pulls[active].id} options={plan.pulls.map((pull, index) => ({ value: pull.id, label: `${copy.pull} ${index + 1} · ${pull.title[locale]}` }))}
            onValueChange={id => { const index = plan.pulls.findIndex(pull => pull.id === id); if (index >= 0) onPull(index); }} /></div>}
          {!plan.encounter && !groupedArena && <div className={styles.field}><span><RaidPlannerIcon slug={plan.slug} kind="arena" fallback={<Skull size={15} aria-hidden="true" />} />{t.boss}</span><AtlasValyroSelect aria-label={t.boss} className={styles.assetSelect} data-raid-map-select value={arenaBoss}
            options={bosses.filter(b => atlas?.arenas[b.slug]?.length).map(b => ({ value: b.slug, label: b.name[locale] }))} onValueChange={onBoss} /></div>}
          {variants.length > 1 && <div className={styles.field}><span>{t.variant}</span><AtlasValyroSelect aria-label={t.variant} className={styles.assetSelect} data-raid-map-select={groupedArena ? undefined : ""} data-raid-arena-variant={groupedArena ? "" : undefined} value={arena?.id}
            options={variants.map(v => ({ value: v.id, label: v.id === "main" ? bossCopy.variantMain : bossCopy.variantAlt }))} onValueChange={variant => onVariant(variant)} /></div>}
        </>}
      </div>
  );
}

function RaidMapProgression({ plan, locale, bosses, defaultBoss }: { plan: RaidPullPlan; locale: "ru" | "en"; bosses: RaidPullPlan["bosses"]; defaultBoss: string }) {
  const t = raidMapCopy[locale];
  const progression = plan.atlas?.progression;
  const prefix = locale === "ru" ? "/ru" : "";
  return <>
    {progression && bosses.length > 1 && <div className={styles.progression} data-raid-map-progression><h4><RaidPlannerIcon slug={plan.slug} kind="map" fallback={<Route size={17} aria-hidden="true" />} />{t.sequence}</h4>{progression.note[locale] ? <p>{progression.note[locale]}</p> : null}
      <ol className={styles.bossRail}>{bosses.map((boss, i) => <li key={boss.slug}><Link className={styles.railChoice} data-active={defaultBoss === boss.slug} data-raid-boss-link={boss.slug} href={`${prefix}/wow/raids/${plan.slug}/${boss.slug}`} aria-label={`${t.tactics}: ${boss.name[locale]}`}><b>{i + 1}</b><span>{boss.name[locale]}</span><ArrowUpRight size={12} aria-hidden="true" /></Link></li>)}</ol>
      {plan.slug !== "the-voidspire" && progression.lieutenants.length > 0 && <details className={styles.lieutenants}><summary>{t.lieutenants} · {progression.lieutenants.length}</summary><ul>{progression.lieutenants.map(npc => <li key={npc.npcId}><a href={`https://www.wowhead.com/npc=${npc.npcId}`} target="_blank" rel="noreferrer">{npc.name[locale]}<ArrowUpRight size={12} aria-hidden="true" /></a><span>{npc.note[locale]}</span></li>)}</ul></details>}
    </div>}
  </>;
}
