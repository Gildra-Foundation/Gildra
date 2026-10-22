"use client";

import { memo, startTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { BookOpen, Gauge, Keyboard, ListOrdered, Pause, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationAbility, RotationCast, RotationCooldownWindow, RotationSimulationResult } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import { ACTION_BAR_COLUMNS, ACTION_BAR_ROWS, actionBarKeyLabel } from "./actionBarLayout";
import { useActionBarLayout } from "./useActionBarLayout";
import { RotationCursorValueContext, useRotationCursorRef } from "./rotationCursorContext";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";
import folio from "./rotationManuscript.module.css";
import bindingStyles from "./actionBarBinding.module.css";
import spread from "./rotationBookSpread.module.css";
import motion from "./rotationMotion.module.css";
import shell from "./rotationLabShell.module.css";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { combatActionBarCopy } from "./combatActionBarCopy";

const ActionBarBindingEditor = dynamic(
  () => import("./ActionBarBindingEditor").then((module) => module.ActionBarBindingEditor),
);
const SpellbookDrawer = dynamic(
  () => import("./SpellbookDrawer").then((module) => module.SpellbookDrawer),
);

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function resourceAt(result: RotationSimulationResult, cursor: number) {
  const track = result.resources?.[0];
  if (!track?.points.length) return null;
  const point = track.points[Math.max(0, upperBoundByTime(track.points, cursor + .01) - 1)];
  return {
    label: track.label,
    maximum: track.maximum,
    current: Math.round((point.value / 100) * track.maximum),
    percent: Math.max(0, Math.min(100, point.value)),
  };
}

function upperBoundByTime<T extends { time: number }>(items: readonly T[], time: number) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lowerBoundByTime<T extends { time: number }>(items: readonly T[], time: number) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundByNumber(items: readonly number[], value: number) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function castsAt(casts: readonly RotationCast[], cursor: number) {
  const nextIndex = lowerBoundByTime(casts, cursor - .03);
  const lastIndex = upperBoundByTime(casts, cursor + .03) - 1;
  return {
    next: nextIndex >= casts.length ? null : casts[nextIndex],
    last: lastIndex < 0 ? null : casts[lastIndex],
  };
}

function cooldownAt(cooldown: RotationCooldownWindow | undefined, cursor: number) {
  if (!cooldown?.duration) return null;
  const useIndex = upperBoundByNumber(cooldown.uses, cursor + .01) - 1;
  if (useIndex < 0) return null;
  const lastUse = cooldown.uses[useIndex];
  const remaining = Math.max(0, cooldown.duration - (cursor - lastUse));
  return remaining > .05 ? { remaining, percent: Math.min(100, remaining / cooldown.duration * 100) } : null;
}

type ActionBarSlotProps = {
  position: number;
  ability?: RotationAbility;
  cooldownRemaining: string | null;
  cooldownExact: string | null;
  cooldownAngle: number | null;
  binding: string;
  recommended: boolean;
  justCast: boolean;
  keyLabel: string;
  bindingLabel: string;
  bindingMode: boolean;
  bindingSelected: boolean;
  spellbookOpen: boolean;
  actionBarReady: boolean;
  manuscript: boolean;
  ru: boolean;
  slotRef: (node: HTMLButtonElement | null) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, abilityId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, position: number) => void;
  onSelect: (position: number, abilityId?: string) => void;
  onRemove: (position: number) => void;
};

const ActionBarSlot = memo(function ActionBarSlot({
  position, ability, cooldownRemaining, cooldownExact, cooldownAngle, binding, recommended, justCast, keyLabel, bindingLabel,
  bindingMode, bindingSelected, spellbookOpen, actionBarReady, manuscript, ru, slotRef, onDragStart, onDrop, onSelect, onRemove,
}: ActionBarSlotProps) {
  return (
    <div className={`${styles.wowActionCell} ${folio.cell} ${bindingStyles.cell} ${manuscript ? motion.abilityCell : ""}`} data-empty={!ability || undefined} data-binding-mode={bindingMode || undefined} data-binding-selected={bindingSelected || undefined} onDragOver={(event) => { if (!bindingMode) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { if (!bindingMode) onDrop(event, position); }}>
      {ability ? <>
        <button ref={slotRef} type="button" draggable={!bindingMode && actionBarReady} onDragStart={(event) => onDragStart(event, ability.id)} className={`${styles.wowActionSlot} ${manuscript ? motion.slotInput : ""} ${recommended ? styles.wowActionRecommended : ""} ${justCast ? deferredLabStyles.wowActionCast : ""}`} data-cooldown={cooldownRemaining !== null || undefined} onClick={() => onSelect(position, ability.id)} title={`${ability.name} · ${binding || combatActionBarCopy[ru ? "ru" : "en"].unbound}${ability.hint ? ` — ${ability.hint}` : ""}`} aria-label={bindingMode ? bindingLabel : `${ability.name}, ${keyLabel}${cooldownExact ? `, ${cooldownExact} ${combatActionBarCopy[ru ? "ru" : "en"].unitS}` : ""}`}>
          <kbd>{keyLabel}</kbd>
          <AbilityIcon ability={ability} size="lg" />
          {cooldownAngle !== null && <i className={deferredLabStyles.wowCooldownSweep} style={{ "--cooldown-angle": `${cooldownAngle}deg` } as CSSProperties}><strong>{cooldownRemaining}</strong></i>}
        </button>
        {spellbookOpen && <button type="button" className={deferredLabStyles.wowSlotRemove} onClick={() => onRemove(position)} aria-label={`${combatActionBarCopy[ru ? "ru" : "en"].removeFromBar}: ${ability.name}`}><Trash2 /></button>}
      </> : <button ref={slotRef} type="button" disabled={!actionBarReady} className={`${styles.wowEmptySlot} ${manuscript ? motion.slotInput : ""}`} data-key-label={keyLabel} onClick={() => onSelect(position)} title={binding || combatActionBarCopy[ru ? "ru" : "en"].unbound} aria-label={bindingMode ? bindingLabel : `${combatActionBarCopy[ru ? "ru" : "en"].addAbilityToSlot} ${position + 1}`} />}
    </div>
  );
});

export function CombatActionBar({
  abilities, rules, result, fightLength, lang, stale, slug, storageScope, characterSlug, dataMode,
  onCursor, manuscript = false,
}: {
  abilities: RotationAbility[];
  rules: string[];
  result: RotationSimulationResult | null;
  fightLength: number;
  lang: Lang;
  stale: boolean;
  slug: string;
  storageScope: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
  manuscript?: boolean;
  onCursor: (value: number) => void;
}) {
  const ru = lang === "ru";
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [mobileBookPage, setMobileBookPage] = useState<"index" | "abilities">("index");
  const [preferredSlot, setPreferredSlot] = useState<number | undefined>();
  const [bindingMode, setBindingMode] = useState(false);
  const [bindingPosition, setBindingPosition] = useState<number | null>(null);
  const [bindingNotice, setBindingNotice] = useState("");
  const bindingToggleRef = useRef<HTMLButtonElement>(null);
  const slotRefs = useRef(new Map<number, HTMLButtonElement>());
  const slotRefCallbacks = useRef(new Map<number, (node: HTMLButtonElement | null) => void>());
  const spellbookId = useId();
  const spellbookToggleRef = useRef<HTMLButtonElement>(null);
  const closeSpellbook = useCallback(() => { setSpellbookOpen(false); setPreferredSlot(undefined); spellbookToggleRef.current?.focus({ preventScroll: true }); }, []);
  const actionBar = useActionBarLayout({ abilities, rules, slug, storageScope, characterSlug, dataMode });
  const actionBarRef = useRef(actionBar);
  actionBarRef.current = actionBar;
  const cursorRef = useRotationCursorRef();
  const slotRefForPosition = useCallback((position: number) => {
    let callback = slotRefCallbacks.current.get(position);
    if (!callback) {
      callback = (node) => {
        if (node) slotRefs.current.set(position, node);
        else slotRefs.current.delete(position);
      };
      slotRefCallbacks.current.set(position, callback);
    }
    return callback;
  }, []);
  const duration = result?.fightLengthSeconds ?? fightLength;

  useEffect(() => {
    if (!playing || !result) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const current = performance.now();
      const next = Math.min(result.fightLengthSeconds, cursorRef.current + (current - previous) / 1000 * speed);
      previous = current;
      cursorRef.current = next;
      startTransition(() => onCursor(next));
      if (next >= result.fightLengthSeconds) setPlaying(false);
    }, 80);
    return () => window.clearInterval(timer);
  }, [onCursor, playing, result, speed]);
  useEffect(() => { if (!result || stale) setPlaying(false); }, [result, stale]);

  const byId = useMemo(() => new Map(abilities.map((ability) => [ability.id, ability])), [abilities]);
  const slotsByPosition = useMemo(() => new Map(actionBar.slots.map((slot) => [slot.position, slot])), [actionBar.slots]);
  // Rows without abilities are only drop targets: they appear while the spellbook
  // or key binding is open (and always in the manuscript), never as empty strips.
  const visibleRows = useMemo(() => Array.from({ length: ACTION_BAR_ROWS }, (_, rowIndex) => rowIndex).filter((rowIndex) => (
    rowIndex === 0 || manuscript || spellbookOpen || bindingMode
    || Array.from({ length: ACTION_BAR_COLUMNS }, (_, columnIndex) => slotsByPosition.get(rowIndex * ACTION_BAR_COLUMNS + columnIndex)).some((slot) => slot && byId.has(slot.abilityId))
  )), [bindingMode, byId, manuscript, slotsByPosition, spellbookOpen]);
  const casts = useMemo(() => [...(result?.casts ?? [])].filter((cast) => cast.lane !== "proc").sort((left, right) => left.time - right.time), [result?.casts]);
  const cooldownsByAbility = useMemo(() => new Map((result?.cooldowns ?? []).map((cooldown) => [cooldown.abilityId, cooldown])), [result?.cooldowns]);
  const labelAt = (position: number) => byId.get(slotsByPosition.get(position)?.abilityId ?? "")?.name ?? combatActionBarCopy[lang].emptySlot;
  const jumpToAbility = useCallback((abilityId: string) => {
    if (!result) return;
    const cursor = cursorRef.current;
    const next = casts.find((cast) => cast.abilityId === abilityId && cast.time > cursor + .05)
      ?? casts.find((cast) => cast.abilityId === abilityId);
    if (next) onCursor(next.time);
  }, [casts, cursorRef, onCursor, result]);
  const openSpellbook = useCallback((position?: number) => {
    setPreferredSlot(position);
    setMobileBookPage(position === undefined ? "index" : "abilities");
    setSpellbookOpen(true);
  }, []);
  const selectActionBarSlot = useCallback((position: number, abilityId?: string) => {
    if (bindingMode) setBindingPosition(position);
    else if (abilityId) jumpToAbility(abilityId);
    else openSpellbook(position);
  }, [bindingMode, jumpToAbility, openSpellbook]);
  const dragAbility = useCallback((event: DragEvent<HTMLButtonElement>, abilityId: string) => {
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-gildra-ability", abilityId);
    event.dataTransfer.setData("text/plain", abilityId);
  }, []);
  const dropAbility = useCallback((event: DragEvent<HTMLDivElement>, position: number) => {
    event.preventDefault();
    const abilityId = event.dataTransfer.getData("application/x-gildra-ability") || event.dataTransfer.getData("text/plain");
    if (byId.has(abilityId)) actionBarRef.current.placeAbility(abilityId, position);
  }, [byId]);
  const removeFromActionBar = useCallback((position: number) => actionBarRef.current.removeAt(position), []);
  const closeBinding = () => {
    setBindingPosition(null);
    if (bindingPosition !== null) slotRefs.current.get(bindingPosition)?.focus({ preventScroll: true });
  };
  const saveBinding = (key: string) => {
    if (bindingPosition === null) return;
    actionBar.bindAt(bindingPosition, key);
    setBindingNotice(ru ? `Ячейка ${bindingPosition + 1}: ${key || "бинд снят"}.` : `Slot ${bindingPosition + 1}: ${key || "binding cleared"}.`);
    closeBinding();
  };

  const addFromSpellbook = (abilityId: string) => { actionBar.placeAbility(abilityId, preferredSlot); setPreferredSlot(undefined); };

  return (
    <section className={`${styles.combatDeck} ${manuscript ? folio.manuscript : ""}`} aria-labelledby="combat-deck-title">

      {result ? <RotationCursorValueContext.Consumer>{(cursor) => {
        const { next: nextCast } = castsAt(casts, cursor);
        const activeProcs = (result?.procs ?? []).filter((proc) => cursor >= proc.time && cursor <= proc.time + proc.duration);
        const resource = result ? resourceAt(result, cursor) : null;
        return <div className={`${styles.combatDeckReadout} ${manuscript ? spread.readout : ""}`}>
        <div className={deferredLabStyles.combatResource} style={{ "--resource-fill": `${resource?.percent ?? 0}%` } as CSSProperties}>
          <Gauge />
          <span><small>{resource?.label ?? combatActionBarCopy[lang].resource}</small><strong>{resource ? `${resource.current} / ${resource.maximum}` : "—"}</strong></span>
          <i><b /></i>
        </div>
        <div className={deferredLabStyles.combatProcRail} aria-live="polite">
          <Sparkles />
          <span><small>{combatActionBarCopy[lang].activeProcsBuffs}</small>{activeProcs.length ? <strong>{activeProcs.map((proc) => proc.name).join(" · ")}</strong> : <strong>{combatActionBarCopy[lang].noActiveWindowsNow}</strong>}</span>
        </div>
        <div className={deferredLabStyles.combatNextCast}>
          <small>{combatActionBarCopy[lang].nextAction}</small>
          <strong>{nextCast ? byId.get(nextCast.abilityId)?.name ?? nextCast.abilityId : "—"}</strong>
        </div>
        </div>;
      }}</RotationCursorValueContext.Consumer> : null}

      <div className={styles.actionBarWorkbench} data-book-open={spellbookOpen || undefined} onKeyDown={(event) => {
        if (bindingMode && bindingPosition === null && event.key === "Escape") {
          event.preventDefault(); setBindingMode(false); bindingToggleRef.current?.focus();
        }
      }}>
        <div className={`${styles.actionBarPanel} ${manuscript ? spread.barSheet : ""}`} data-book-surface={manuscript ? "foldout" : undefined}>
          <div className={`${styles.actionBarToolbar} ${bindingStyles.toolbar}`} data-binding-mode={bindingMode || undefined}>
            <div><strong>{combatActionBarCopy[lang].characterActionBar}</strong></div>
            <span className={styles.actionBarSaveState} data-state={actionBar.syncState}>{!actionBar.ready ? combatActionBarCopy[lang].loadingLayout : actionBar.syncState === "saving" ? combatActionBarCopy[lang].saving : actionBar.syncState === "offline" ? combatActionBarCopy[lang].savedLocally : actionBar.syncState === "synced" ? combatActionBarCopy[lang].synced : combatActionBarCopy[lang].autosave}</span>
            <button ref={bindingToggleRef} type="button" className={`${styles.actionBarUtility} ${bindingStyles.toggle}`} aria-pressed={bindingMode} disabled={!actionBar.ready} onClick={() => { setBindingMode(!bindingMode); setBindingPosition(null); setBindingNotice(""); setSpellbookOpen(false); setPlaying(false); }}><Keyboard /><span>{bindingMode ? combatActionBarCopy[lang].doneBinding : combatActionBarCopy[lang].keyBindings}</span></button>
            <button type="button" className={styles.actionBarUtility} disabled={bindingMode || !actionBar.ready} onClick={actionBar.organize} title={combatActionBarCopy[lang].compactAbilitiesBindingsStay}><ListOrdered /> <span>{combatActionBarCopy[lang].arrange}</span></button>
            <button type="button" className={styles.actionBarUtility} disabled={bindingMode || !actionBar.ready} onClick={actionBar.reset} title={combatActionBarCopy[lang].restoreDefaultAbilitiesAnd}><RotateCcw /> <span>{combatActionBarCopy[lang].reset}</span></button>
            <button ref={spellbookToggleRef} type="button" className={styles.spellbookToggle} disabled={bindingMode || !actionBar.ready} aria-expanded={spellbookOpen} aria-controls={spellbookOpen ? spellbookId : undefined} onClick={() => spellbookOpen ? closeSpellbook() : openSpellbook()}><BookOpen /> {manuscript ? (spellbookOpen ? combatActionBarCopy[lang].hideAbilities : combatActionBarCopy[lang].addAbilities) : (spellbookOpen ? combatActionBarCopy[lang].closeBook : combatActionBarCopy[lang].spellbook)}</button>
          </div>
          {bindingMode && <p className={bindingStyles.modeHint} role="status">{bindingNotice} {combatActionBarCopy[lang].selectAnySlotBelow}</p>}
          {bindingMode && bindingPosition !== null && <ActionBarBindingEditor key={bindingPosition} position={bindingPosition} label={labelAt(bindingPosition)} bindings={actionBar.bindings} labelAt={labelAt} ru={ru} manuscript={manuscript} onApply={saveBinding} onClose={closeBinding} />}
          <div className={`${styles.wowBarFrame} ${folio.barViewport}`} role="region" tabIndex={0} aria-label={combatActionBarCopy[lang].actionBarScrollsSideways}>
            <div className={`${styles.wowBarAssembly} ${folio.assembly}`}>
              <div className={styles.wowBarEndcap} aria-hidden="true" />
              <div className={`${styles.wowBarPlate} ${folio.plate}`}>
                <RotationCursorValueContext.Consumer>{(cursor) => {
                  const { next: nextCast, last: lastCast } = castsAt(casts, cursor);
                  return <div className={`${styles.wowActionRows} ${folio.rows}`}>
                  {visibleRows.map((rowIndex) => <div className={`${deferredLabStyles.actionBarLane} ${folio.lane}`} key={rowIndex}>
                    {manuscript && <span className={folio.rowLabel} aria-hidden="true"><b>{["I", "II", "III"][rowIndex]}</b><small>{combatActionBarCopy[lang].row}</small></span>}
                    <div className={`${styles.wowActionBar} ${folio.actionRow}`} role="group" aria-label={ru ? `Панель ${rowIndex + 1}: 12 ячеек` : `Action bar ${rowIndex + 1}: 12 slots`}>
                      {Array.from({ length: ACTION_BAR_COLUMNS }, (_, columnIndex) => {
                        const position = rowIndex * ACTION_BAR_COLUMNS + columnIndex;
                        const slot = slotsByPosition.get(position);
                        const ability = slot ? byId.get(slot.abilityId) : undefined;
                        const cooldown = ability && result ? cooldownAt(cooldownsByAbility.get(ability.id), cursor) : null;
                        const recommended = Boolean(ability && nextCast?.abilityId === ability.id);
                        const justCast = Boolean(ability && lastCast?.abilityId === ability.id && cursor - lastCast.time < .42);
                        const keyLabel = actionBarKeyLabel(actionBar.bindings[position] ?? "") || "—";
                        const bindingLabel = `${combatActionBarCopy[lang].bindKey}: ${labelAt(position)} (${position + 1})`;
                        const cooldownRemaining = cooldown ? cooldown.remaining >= 10 ? String(Math.ceil(cooldown.remaining)) : cooldown.remaining.toFixed(1) : null;
                        return <ActionBarSlot key={position} position={position} ability={ability} cooldownRemaining={cooldownRemaining} cooldownExact={cooldown ? cooldown.remaining.toFixed(1) : null} cooldownAngle={cooldown ? Math.round(cooldown.percent * 3.6) : null} binding={actionBar.bindings[position] ?? ""} recommended={recommended} justCast={justCast} keyLabel={keyLabel} bindingLabel={bindingLabel} bindingMode={bindingMode} bindingSelected={bindingPosition === position} spellbookOpen={spellbookOpen} actionBarReady={actionBar.ready} manuscript={manuscript} ru={ru} slotRef={slotRefForPosition(position)} onDragStart={dragAbility} onDrop={dropAbility} onSelect={selectActionBarSlot} onRemove={removeFromActionBar} />;
                      })}
                    </div>
                  </div>)}
                  </div>;
                }}</RotationCursorValueContext.Consumer>
              </div>
              <div className={`${styles.wowBarEndcap} ${deferredLabStyles.wowBarEndcapRight}`} aria-hidden="true" />
            </div>
          </div>
          <p className={styles.actionBarHint}>{manuscript ? combatActionBarCopy[lang].chooseAnEmptySlot : spellbookOpen ? combatActionBarCopy[lang].dragAnAbilityFrom : combatActionBarCopy[lang].openTheSpellbookTo}</p>
        </div>
        {spellbookOpen && <div id={spellbookId} className={`${styles.spellbookViewport} ${folio.catalogViewport} ${manuscript ? motion.catalogReveal : ""}`} role="region" aria-label={manuscript ? combatActionBarCopy[lang].abilityCatalogue : combatActionBarCopy[lang].spellbook} data-mobile-page={mobileBookPage}>
          {!manuscript && <nav className={styles.spellbookMobileNav} aria-label={combatActionBarCopy[lang].bookPages}>
            <button type="button" aria-pressed={mobileBookPage === "index"} onClick={() => setMobileBookPage("index")}>{combatActionBarCopy[lang].contents}</button>
            <button type="button" aria-pressed={mobileBookPage === "abilities"} onClick={() => setMobileBookPage("abilities")}>{combatActionBarCopy[lang].abilities}</button>
          </nav>}
          <SpellbookDrawer abilities={abilities} assignedIds={actionBar.assignedIds} lang={lang} presentation={manuscript ? "catalog" : "book"} onClose={closeSpellbook} onAdd={addFromSpellbook} />
        </div>}
      </div>

      {result ? <RotationCursorValueContext.Consumer>{(cursor) => <footer className={`${styles.combatPlayback} ${manuscript ? `${spread.foldout} ${spread.playbackSheet}` : ""}`} data-book-surface={manuscript ? "foldout" : undefined}>
        <div>
          <button type="button" disabled={stale} onClick={() => { if (cursor >= duration) onCursor(0); setPlaying((value) => !value); }} aria-label={playing ? combatActionBarCopy[lang].pause : combatActionBarCopy[lang].play}>{playing ? <Pause /> : <Play />}</button>
          <button type="button" onClick={() => { setPlaying(false); onCursor(0); }} aria-label={combatActionBarCopy[lang].restart}><RotateCcw /></button>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label={combatActionBarCopy[lang].playbackSpeed}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </div>
        <label><span>{stamp(cursor)}</span><input type="range" aria-label={combatActionBarCopy[lang].simulationPosition} min="0" max={duration} step="0.1" value={Math.min(cursor, duration)} onChange={(event) => { setPlaying(false); onCursor(Number(event.target.value)); }} /><span>{stamp(duration)}</span></label>
      </footer>}</RotationCursorValueContext.Consumer> : null}

      <div className={`${shell.footnote} ${manuscript ? spread.leafNotes : ""}`} data-atlas-ui>
        <AtlasDisclosure summary={combatActionBarCopy[lang].howThePanelIs}>
          <p>{combatActionBarCopy[lang].aoeShowsTotalDps}</p>
        </AtlasDisclosure>
      </div>
    </section>
  );
}
