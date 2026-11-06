"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import { Check, Eraser, Users, X } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { MaterialSlotButton } from "@/components/wow/shared/material/MaterialButtonBase";
import material from "@/components/wow/shared/material/material.module.css";
import { LibraryHoverPreview } from "@/components/library/LibraryHoverPreview";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { specIcon } from "@/lib/games/wow/assets";
import {
  ARMORS, COVERAGE, GROUP_SIZE, PLANNER_CLASSES, RAID_SIZES, ROLES, TYPICAL_MYTHIC, armorCounts, coverageOf, decodeRoster,
  emptyRoster, encodeRoster, isRaidSize, resizeRoster, roleCounts, specBySlug, spellOf,
  type CoverageItem, type PlannerSpec, type RaidSize, type Roster,
} from "@/lib/wow/raidComposition/model";
import { raidCompositionCopy, type RaidCompositionCopy } from "./raidCompositionCopy";
import styles from "./raidComposition.module.css";

type Lang = "en" | "ru";
const STORAGE_KEY = "gildra:raid-composition";
const CLASS_TOKENS: Record<string, string> = {
  deathknight: "dk", demonhunter: "dh", evoker: "evoker", mage: "mage", paladin: "pal", rogue: "rogue", druid: "druid",
  priest: "priest", hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};
const classStyle = (classKey: string) => ({ "--class-color": `var(--c-${CLASS_TOKENS[classKey] ?? classKey}, var(--atlas-text-muted))` }) as CSSProperties;

function specName(spec: PlannerSpec, lang: Lang, copy: RaidCompositionCopy) {
  return lang === "ru" ? copy.specLabel(spec.specNameRu, spec.classNameRu) : copy.specLabel(spec.specName, spec.className);
}
const className = (spec: PlannerSpec, lang: Lang) => (lang === "ru" ? spec.classNameRu : spec.className);
const shortSpec = (spec: PlannerSpec, lang: Lang) => (lang === "ru" ? spec.specNameRu : spec.specName);

function SpecIcon({ spec, size }: { spec: PlannerSpec; size: number }) {
  const src = specIcon(spec.specName, spec.classSlug, spec.specShort);
  return src ? <Image className={styles.specIcon} src={src} alt="" width={size} height={size} draggable={false} /> : null;
}

/**
 * Who can bring an item: whole classes by class name, single specializations by spec name.
 * With players in the roster it names them instead (one entry per player).
 */
function providerLine(item: CoverageItem, providers: string[], lang: Lang, copy: RaidCompositionCopy) {
  if (providers.length) {
    const counts = new Map<string, number>();
    for (const slug of providers) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    const names = [...counts].map(([slug, count]) => `${specName(specBySlug.get(slug)!, lang, copy)}${count > 1 ? ` ×${count}` : ""}`);
    return names.length > 3 ? `${names.slice(0, 3).join(" · ")} +${names.length - 3}` : names.join(" · ");
  }
  const slugs = new Set(item.sources.flatMap((source) => source.specs));
  const parts: string[] = [];
  for (const { specs } of PLANNER_CLASSES) {
    const mine = specs.filter((spec) => slugs.has(spec.slug));
    if (!mine.length) continue;
    if (mine.length === specs.length) parts.push(className(mine[0], lang));
    else parts.push(...mine.map((spec) => specName(spec, lang, copy)));
  }
  return parts.join(" · ");
}

type Drag = { kind: "spec"; slug: string } | { kind: "slot"; index: number };
const DRAG_TYPE = "application/x-gildra-raid-slot";

/** The plaque and button geometry of the page kit arrive from the server, so the kit tables stay out of this bundle. */
export function RaidCompositionPlanner({ lang, libraryOpen, plaqueStyle, buttonStyle }: { lang: Lang; libraryOpen: boolean; plaqueStyle: CSSProperties; buttonStyle: CSSProperties }) {
  const copy = raidCompositionCopy[lang];
  const [size, setSize] = useState<RaidSize>("mythic");
  const [roster, setRoster] = useState<Roster>(() => emptyRoster("mythic"));
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const dragging = useRef<Drag | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "palette" | null>(null);

  // State from the shared link first, otherwise the visitor's last roster.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let nextSize: RaidSize = "mythic";
    let code = "";
    if (params.has("r") || params.has("size")) {
      const sizeParam = params.get("size");
      if (isRaidSize(sizeParam)) nextSize = sizeParam;
      code = params.get("r") ?? "";
    } else {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as { size?: string; r?: string } | null;
        if (saved && isRaidSize(saved.size)) nextSize = saved.size;
        if (saved && typeof saved.r === "string") code = saved.r;
      } catch { /* storage closed or malformed: start empty */ }
    }
    // The address and storage exist only in the browser: read once after hydration so the server HTML stays the empty roster.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(nextSize);
    setRoster(decodeRoster(code, nextSize));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const code = encodeRoster(roster);
    const url = new URL(window.location.href);
    if (size === "mythic") url.searchParams.delete("size"); else url.searchParams.set("size", size);
    if (code) url.searchParams.set("r", code); else url.searchParams.delete("r");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ size, r: code })); } catch { /* private mode */ }
  }, [ready, roster, size]);

  const coverage = useMemo(() => coverageOf(roster), [roster]);
  const roles = useMemo(() => roleCounts(roster), [roster]);
  const armor = useMemo(() => armorCounts(roster), [roster]);
  const players = roster.filter(Boolean).length;
  const { groups, max } = RAID_SIZES[size];

  const announce = useCallback((text: string) => setMessage(text), []);
  const groupOf = (index: number) => Math.floor(index / GROUP_SIZE) + 1;
  const label = (slug: string) => specName(specBySlug.get(slug)!, lang, copy);

  /** A spec goes into the chosen empty slot, otherwise into the first free one; the new player stays picked so a tap on another slot moves it. */
  const addSpec = (slug: string, target?: number) => {
    const into = target ?? (selected !== null && !roster[selected] ? selected : roster.indexOf(null));
    if (into === -1 || into === undefined) { announce(copy.full); return; }
    setRoster((current) => current.map((value, index) => (index === into ? slug : value)));
    setSelected(target === undefined ? into : null);
    announce(copy.added(label(slug), groupOf(into)));
  };

  const removeAt = (index: number) => {
    const slug = roster[index];
    if (!slug) return;
    setRoster((current) => current.map((value, i) => (i === index ? null : value)));
    if (selected === index) setSelected(null);
    announce(copy.removed(label(slug)));
  };

  /** Swap two slots (a move when the target is empty). */
  const moveSlot = (from: number, to: number) => {
    if (from === to) return;
    const slug = roster[from];
    setRoster((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    if (slug) announce(copy.moved(label(slug), groupOf(to)));
  };

  const pressSlot = (index: number) => {
    if (selected === null) { setSelected(index); return; }
    if (selected === index) { setSelected(null); return; }
    if (roster[selected]) { moveSlot(selected, index); setSelected(null); return; }
    setSelected(index);
  };

  const slotKey = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeAt(index); }
    if (event.key === "Escape") setSelected(null);
  };

  const chooseSize = (value: string) => {
    if (!isRaidSize(value) || value === size) return;
    setSize(value);
    setRoster((current) => resizeRoster(current, value));
    setSelected(null);
  };

  const applyPreset = (preset: "clear" | "typical") => {
    if (preset === "clear") { setRoster(emptyRoster(size)); setSelected(null); return; }
    setSize("mythic");
    setRoster(resizeRoster(TYPICAL_MYTHIC, "mythic"));
    setSelected(null);
  };

  // Drag and drop (mouse): palette → slot, slot → slot, slot → palette removes.
  const startDrag = (drag: Drag) => (event: DragEvent) => {
    dragging.current = drag;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag));
  };
  const endDrag = () => { dragging.current = null; setDropTarget(null); };
  const overSlot = (index: number) => (event: DragEvent) => {
    if (!dragging.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== index) setDropTarget(index);
  };
  const dropOnSlot = (index: number) => (event: DragEvent) => {
    event.preventDefault();
    const drag = dragging.current;
    endDrag();
    if (!drag) return;
    if (drag.kind === "spec") addSpec(drag.slug, index);
    else moveSlot(drag.index, index);
    setSelected(null);
  };
  const overPalette = (event: DragEvent) => {
    if (dragging.current?.kind !== "slot") return;
    event.preventDefault();
    if (dropTarget !== "palette") setDropTarget("palette");
  };
  const dropOnPalette = (event: DragEvent) => {
    event.preventDefault();
    const drag = dragging.current;
    endDrag();
    if (drag?.kind === "slot") removeAt(drag.index);
  };

  const spellLink = (item: CoverageItem, providers: string[]) => {
    const source = item.sources.find((candidate) => providers.some((slug) => candidate.specs.includes(slug))) ?? item.sources[0];
    const spell = spellOf(source.spell);
    const name = copy.labels[item.id] ?? spell[lang];
    return { spell, name, href: libraryRecordPath(lang, "spell", spell.uuid, lang === "ru" ? spell.slugRu : spell.slug) };
  };

  return (
    <div className={styles.planner}>
      <section className={`${material.plaque} ${styles.plaque}`} style={plaqueStyle} aria-labelledby="raid-roster-title">
        <div className={styles.plaqueHead}>
          <h2 id="raid-roster-title" className={material.plaqueTitle}>{copy.rosterTitle}</h2>
          <div className={styles.toolbar}>
            <div className={styles.sizeSwitch}>
              <AtlasSegmented aria-label={copy.size} value={size} onValueChange={chooseSize} fullWidth
                options={(["mythic", "flex"] as const).map((value) => ({ value, label: copy.sizes[value] }))} />
            </div>
            <div className={styles.presets} role="group" aria-label={copy.presets}>
              <MaterialSlotButton slotStyle={buttonStyle} size="sm" icon={<Users aria-hidden="true" />} onClick={() => applyPreset("typical")}>{copy.typical}</MaterialSlotButton>
              <MaterialSlotButton slotStyle={buttonStyle} size="sm" icon={<Eraser aria-hidden="true" />} onClick={() => applyPreset("clear")} disabled={!players}>{copy.clear}</MaterialSlotButton>
              <AtlasShareButton title={copy.title} locale={lang} />
            </div>
          </div>
        </div>

        <div className={styles.palette} data-drop={dropTarget === "palette" || undefined} onDragOver={overPalette} onDragLeave={() => setDropTarget(null)} onDrop={dropOnPalette}>
          <h3 className={styles.paletteTitle}>{copy.specs}</h3>
          <ul className={styles.classes}>
            {PLANNER_CLASSES.map(({ classKey, specs }) => (
              <li key={classKey} className={styles.classCard} data-wide={specs.length > 3 || undefined} style={classStyle(classKey)}>
                <span className={styles.className}>{className(specs[0], lang)}</span>
                <span className={styles.classSpecs}>
                  {specs.map((spec) => {
                    const name = specName(spec, lang, copy);
                    return (
                      <button key={spec.slug} type="button" className={styles.paletteSpec} title={name} aria-label={copy.add(name)}
                        draggable onDragStart={startDrag({ kind: "spec", slug: spec.slug })} onDragEnd={endDrag} onClick={() => addSpec(spec.slug)}>
                        <SpecIcon spec={spec} size={40} />
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className={styles.summary}>
          <div className={styles.summaryItem}><dt>{copy.players}</dt><dd>{players}<span className={styles.summaryMax}> / {max}</span></dd></div>
          {ROLES.map((role) => <div key={role} className={styles.summaryItem}><dt>{copy.roles[role]}</dt><dd>{roles[role]}</dd></div>)}
        </dl>

        <div className={styles.groups} data-groups={groups}>
          {Array.from({ length: groups }, (_, group) => (
            <section key={group} className={styles.group} aria-labelledby={`raid-group-${group + 1}`}>
              <h3 id={`raid-group-${group + 1}`} className={styles.groupTitle}>{copy.group(group + 1)}</h3>
              <ol className={styles.slots}>
                {Array.from({ length: GROUP_SIZE }, (_, slot) => {
                  const index = group * GROUP_SIZE + slot;
                  const slug = roster[index];
                  const spec = slug ? specBySlug.get(slug) : undefined;
                  const name = spec ? specName(spec, lang, copy) : "";
                  return (
                    <li key={index} className={styles.slot} data-filled={spec ? true : undefined} data-selected={selected === index || undefined}
                      data-drop={dropTarget === index || undefined} style={spec ? classStyle(spec.classKey) : undefined}
                      onDragOver={overSlot(index)} onDragLeave={() => setDropTarget(null)} onDrop={dropOnSlot(index)}>
                      <button type="button" className={styles.slotButton} aria-pressed={selected === index}
                        aria-label={spec ? copy.filledSlot(group + 1, slot + 1, name) : copy.emptySlot(group + 1, slot + 1)}
                        draggable={Boolean(spec)} onDragStart={spec ? startDrag({ kind: "slot", index }) : undefined} onDragEnd={endDrag}
                        onClick={() => pressSlot(index)} onKeyDown={(event) => slotKey(index, event)}>
                        {spec ? (
                          <>
                            <SpecIcon spec={spec} size={32} />
                            <span className={styles.slotText}>
                              <span className={styles.slotSpec}>{shortSpec(spec, lang)}</span>
                              <span className={styles.slotClass}>{className(spec, lang)}</span>
                            </span>
                          </>
                        ) : <span className={styles.slotEmpty} aria-hidden="true" />}
                      </button>
                      {spec ? <button type="button" className={styles.slotRemove} aria-label={copy.remove(name)} title={copy.remove(name)} onClick={() => removeAt(index)}><X aria-hidden="true" /></button> : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
        <p className={styles.srOnly} role="status" aria-live="polite">{message}</p>
      </section>

      <section className={`${material.plaque} ${styles.plaque}`} style={plaqueStyle} aria-labelledby="raid-coverage-title">
        <h2 id="raid-coverage-title" className={material.plaqueTitle}>{copy.coverageTitle}</h2>
        <div className={styles.coverage} id="raid-coverage">
          {COVERAGE.map((group) => (
            <section key={group.id} className={styles.coverageGroup} aria-labelledby={`coverage-${group.id}`}>
              <h3 id={`coverage-${group.id}`} className={styles.coverageTitle}>{copy.groups[group.id]}</h3>
              <ul className={styles.items}>
                {group.items.map((item) => {
                  const providers = coverage.get(item.id)?.providers ?? [];
                  const covered = providers.length > 0;
                  const { spell, name, href } = spellLink(item, providers);
                  return (
                    <li key={item.id} className={styles.item} data-covered={covered || undefined} data-hover-preview={libraryOpen ? spell.uuid : undefined} data-hover-icon={`/v1/media/${spell.media}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- catalog media is served by the API, not the image optimizer */}
                      <img className={styles.itemIcon} src={`/v1/media/${spell.media}`} alt="" width={32} height={32} loading="lazy" decoding="async" />
                      <span className={styles.itemText}>
                        {libraryOpen ? <a className={styles.itemName} href={href}>{name}</a> : <span className={styles.itemName}>{name}</span>}
                        <span className={styles.itemWho}>{providerLine(item, providers, lang, copy)}</span>
                      </span>
                      <span className={styles.itemState}>
                        {covered ? <Check aria-hidden="true" /> : null}
                        <span className={styles.srOnly}>{covered ? copy.covered : copy.missing}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <section className={styles.coverageGroup} aria-labelledby="coverage-armor">
            <h3 id="coverage-armor" className={styles.coverageTitle}>{copy.armorTitle}</h3>
            <dl className={styles.armor}>
              {ARMORS.map((type) => (
                <div key={type} className={styles.armorRow} data-covered={armor[type] > 0 || undefined}>
                  <dt>{copy.armor[type]}</dt>
                  <dd>
                    <span className={styles.armorBar} aria-hidden="true"><span style={{ inlineSize: `${players ? (armor[type] / players) * 100 : 0}%` }} /></span>
                    <b>{armor[type]}</b>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        {libraryOpen ? <LibraryHoverPreview rootId="raid-coverage" lang={lang} loadingLabel={copy.loading} /> : null}
      </section>
    </div>
  );
}
