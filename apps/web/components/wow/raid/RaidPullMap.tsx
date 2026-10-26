"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Layers, Route, Skull } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import type { RaidPullPlan } from "./raidPullTypes";
import { RaidSchematicMap } from "./RaidSchematicMap";
import { RaidCartography } from "./RaidCartography";
import { raidMapCopy } from "./raidMapCopy";
import { backgroundKey, mapBackground, readMapPreference, saveMapPreference, subscribeMapPreferences, type RaidMapBackground } from "./raidMapPreferences";
import styles from "./raidMap.module.css";

const serverBackground = () => "map";
const storedBackground = () => readMapPreference(backgroundKey, "map");

function resolveRaidMapView(plan: RaidPullPlan, pull: RaidPullPlan["pulls"][number], floorChoice: { pull: string; id: string }, arenaChoice: { pull: string; boss: string; variant: string }, background: RaidMapBackground) {
  const atlas = plan.atlas;
  const bosses = plan.bosses.length ? plan.bosses : plan.pulls.filter(item => item.bossSlug).map(item => ({ slug: item.bossSlug!, name: item.title, artwork: item.enemies[0]?.artwork, x: item.x, y: item.y }));
  const defaultBoss = pull.bossSlug ?? bosses[0]?.slug ?? "";
  const arenaBoss = arenaChoice.pull === pull.id ? arenaChoice.boss : defaultBoss;
  const variants = atlas?.arenas[arenaBoss] ?? [];
  const arena = variants.find(variant => arenaChoice.pull === pull.id && variant.id === arenaChoice.variant) ?? variants[0];
  const defaultFloor = atlas?.floors.find(item => item.pins.some(pin => pin.bossSlug === defaultBoss)) ?? atlas?.floors[0];
  const floor = atlas?.floors.find(item => floorChoice.pull === pull.id && item.id === floorChoice.id) ?? defaultFloor;
  return { bosses, defaultBoss, arenaBoss, variants, arena, floor, image: background === "arena" ? arena : floor, pins: background === "map" ? floor?.pins ?? [] : [] };
}

export function RaidPullMap({ plan, active, locale, onSelect }: { plan: RaidPullPlan; active: number; locale: "ru" | "en"; onSelect: (index: number, reveal?: boolean) => void }) {
  const t = raidMapCopy[locale];
  const atlas = plan.atlas;
  const pull = plan.pulls[active];
  const preference = useSyncExternalStore(subscribeMapPreferences, storedBackground, serverBackground);
  const background = atlas ? mapBackground(preference) : "grid";
  const [floorChoice, setFloorChoice] = useState({ pull: "", id: "" });
  const [arenaChoice, setArenaChoice] = useState({ pull: "", boss: "", variant: "" });
  const { bosses, defaultBoss, arenaBoss, variants, arena, floor, image, pins } = resolveRaidMapView(plan, pull, floorChoice, arenaChoice, background);
  const progression = atlas?.progression;
  function selectBoss(slug: string, reveal = false) {
    const index = plan.pulls.findIndex(p => p.bossSlug === slug);
    setArenaChoice({ pull: index >= 0 ? plan.pulls[index].id : pull.id, boss: slug, variant: "" });
    if (index >= 0) onSelect(index, reveal);
  }
  return <section className={styles.studio} data-raid-map-studio data-background={background} aria-label={t.background}>
    <div className={styles.backgrounds}><AtlasSegmented className={styles.materialModes} aria-label={t.background} value={background}
      onValueChange={value => saveMapPreference(backgroundKey, value)}
      options={(["map", "arena", "grid", "art"] as const).map(value => ({ value, label: t[value], disabled: !atlas && (value === "map" || value === "arena") }))} /></div>
    {(background === "grid" || background === "art") ? <RaidSchematicMap plan={plan} active={active} locale={locale} onSelect={onSelect} background={background} /> : image && <>
      <div className={styles.selectors}>
        {background === "map" ? <div className={styles.field}><span><Layers size={15} aria-hidden="true" />{t.floor}</span><AtlasValyroSelect aria-label={t.floor} className={styles.assetSelect}
          value={floor?.id} options={atlas!.floors.map(f => ({ value: f.id, label: f.name[locale] }))}
          onValueChange={id => setFloorChoice({ pull: pull.id, id })} /></div> : <>
          <div className={styles.field}><span><Skull size={15} aria-hidden="true" />{t.boss}</span><AtlasValyroSelect aria-label={t.boss} className={styles.assetSelect} value={arenaBoss}
            options={bosses.filter(b => atlas?.arenas[b.slug]?.length).map(b => ({ value: b.slug, label: b.name[locale] }))} onValueChange={selectBoss} /></div>
          {variants.length > 1 && <div className={styles.field}><span>{t.variant}</span><AtlasValyroSelect aria-label={t.variant} className={styles.assetSelect} value={arena?.id}
            options={variants.map(v => ({ value: v.id, label: v.name[locale] }))} onValueChange={variant => setArenaChoice({ pull: pull.id, boss: arenaBoss, variant })} /></div>}
        </>}
      </div>
      <RaidCartography key={`${background}:${image.id}:${pull.id}`} plan={plan} image={image} background={background}
        pins={pins} bosses={bosses} activeBoss={background === "arena" ? arenaBoss : defaultBoss}
        links={progression?.links ?? []} locale={locale} onSelectBoss={selectBoss} />
    </>}
    {progression && <div className={styles.progression}><h4><Route size={17} aria-hidden="true" />{t.sequence}</h4><p>{progression.note[locale]}</p>
      <ol className={styles.bossRail}>{bosses.map((boss, i) => <li key={boss.slug}><button type="button" className={styles.railChoice} aria-pressed={defaultBoss === boss.slug} onClick={() => selectBoss(boss.slug, true)}><b>{i + 1}</b><span>{boss.name[locale]}</span></button></li>)}</ol>
      {progression.lieutenants.length > 0 && <details className={styles.lieutenants}><summary>{t.lieutenants} · {progression.lieutenants.length}</summary><ul>{progression.lieutenants.map(npc => <li key={npc.npcId}><a href={`https://www.wowhead.com/npc=${npc.npcId}`} target="_blank" rel="noreferrer">{npc.name[locale]}<ArrowUpRight size={12} aria-hidden="true" /></a><span>{npc.note[locale]}</span></li>)}</ul></details>}
    </div>}
    <p className={styles.attribution}><span>{t.sources} · © Blizzard Entertainment</span><a href="https://raidplan.io" target="_blank" rel="noreferrer">RaidPlan<ArrowUpRight size={12} aria-hidden="true" /></a></p>
  </section>;
}
