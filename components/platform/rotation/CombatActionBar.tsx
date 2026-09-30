"use client";

import { memo, startTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { BookOpen, Gauge, Keyboard, ListOrdered, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Swords, TimerReset, Trash2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationAbility, RotationCast, RotationCooldownWindow, RotationScenario, RotationSimulationResult } from "@/lib/platform/rotation/types";
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

const ActionBarBindingEditor = dynamic(
  () => import("./ActionBarBindingEditor").then((module) => module.ActionBarBindingEditor),
);
const SpellbookDrawer = dynamic(
  () => import("./SpellbookDrawer").then((module) => module.SpellbookDrawer),
);

export type RotationEncounterTemplate = {
  id: "raid-boss" | "dungeon-boss" | "cleave" | "mythic-pack" | "execute";
  scenario: RotationScenario;
  targets: number;
  fightLength: number;
};

const ENCOUNTERS: RotationEncounterTemplate[] = [
  { id: "raid-boss", scenario: "single-target", targets: 1, fightLength: 300 },
  { id: "dungeon-boss", scenario: "single-target", targets: 1, fightLength: 120 },
  { id: "cleave", scenario: "aoe", targets: 2, fightLength: 120 },
  { id: "mythic-pack", scenario: "aoe", targets: 5, fightLength: 60 },
  { id: "execute", scenario: "execute", targets: 1, fightLength: 60 },
];

const compactDps = (value: number) => value >= 1_000_000
  ? `${(value / 1_000_000).toFixed(2)}M`
  : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

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
        <button ref={slotRef} type="button" draggable={!bindingMode && actionBarReady} onDragStart={(event) => onDragStart(event, ability.id)} className={`${styles.wowActionSlot} ${manuscript ? motion.slotInput : ""} ${recommended ? styles.wowActionRecommended : ""} ${justCast ? deferredLabStyles.wowActionCast : ""}`} data-cooldown={cooldownRemaining !== null || undefined} onClick={() => onSelect(position, ability.id)} title={`${ability.name} · ${binding || (ru ? "Без клавиши" : "Unbound")}${ability.hint ? ` — ${ability.hint}` : ""}`} aria-label={bindingMode ? bindingLabel : `${ability.name}, ${keyLabel}${cooldownExact ? `, ${cooldownExact} ${ru ? "с" : "s"}` : ""}`}>
          <kbd>{keyLabel}</kbd>
          <AbilityIcon ability={ability} size="lg" />
          {cooldownAngle !== null && <i className={deferredLabStyles.wowCooldownSweep} style={{ "--cooldown-angle": `${cooldownAngle}deg` } as CSSProperties}><strong>{cooldownRemaining}</strong></i>}
        </button>
        {spellbookOpen && <button type="button" className={deferredLabStyles.wowSlotRemove} onClick={() => onRemove(position)} aria-label={`${ru ? "Убрать с панели" : "Remove from bar"}: ${ability.name}`}><Trash2 /></button>}
      </> : <button ref={slotRef} type="button" disabled={!actionBarReady} className={`${styles.wowEmptySlot} ${manuscript ? motion.slotInput : ""}`} data-key-label={keyLabel} onClick={() => onSelect(position)} title={binding || (ru ? "Без клавиши" : "Unbound")} aria-label={bindingMode ? bindingLabel : `${ru ? "Добавить умение в ячейку" : "Add ability to slot"} ${position + 1}`} />}
    </div>
  );
});

function encounterText(id: RotationEncounterTemplate["id"], ru: boolean) {
  const labels = ru ? {
    "raid-boss": ["Рейдовый босс", "1 цель · 5 минут"],
    "dungeon-boss": ["Босс ключа", "1 цель · 2 минуты"],
    cleave: ["Две цели", "2 цели · 2 минуты"],
    "mythic-pack": ["Пачка в ключе", "5 целей · 1 минута"],
    execute: ["Добивание", "цель ниже 20%"],
  } : {
    "raid-boss": ["Raid boss", "1 target · 5 minutes"],
    "dungeon-boss": ["Dungeon boss", "1 target · 2 minutes"],
    cleave: ["Cleave", "2 targets · 2 minutes"],
    "mythic-pack": ["Mythic+ pack", "5 targets · 1 minute"],
    execute: ["Execute", "target below 20%"],
  };
  return labels[id];
}

export function CombatActionBar({
  abilities, rules, result, scenario, targets, fightLength, lang, busy, stale, slug, storageScope, characterSlug, dataMode,
  onCursor, onRun, onEncounter, manuscript = false,
}: {
  abilities: RotationAbility[];
  rules: string[];
  result: RotationSimulationResult | null;
  scenario: RotationScenario;
  targets: number;
  fightLength: number;
  lang: Lang;
  busy: boolean;
  stale: boolean;
  slug: string;
  storageScope: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
  manuscript?: boolean;
  onCursor: (value: number) => void;
  onRun: () => void;
  onEncounter: (template: RotationEncounterTemplate) => void;
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
  const exact = Boolean(result?.accuracy?.mode.startsWith("simulationcraft-"));
  const personal = result?.accuracy?.mode === "simulationcraft-armory";

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
  const casts = useMemo(() => [...(result?.casts ?? [])].filter((cast) => cast.lane !== "proc").sort((left, right) => left.time - right.time), [result?.casts]);
  const cooldownsByAbility = useMemo(() => new Map((result?.cooldowns ?? []).map((cooldown) => [cooldown.abilityId, cooldown])), [result?.cooldowns]);
  const activeEncounter = ENCOUNTERS.find((item) => item.scenario === scenario && item.targets === targets && item.fightLength === fightLength)?.id;
  const labelAt = (position: number) => byId.get(slotsByPosition.get(position)?.abilityId ?? "")?.name ?? (ru ? "Пустая ячейка" : "Empty slot");
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
      <header className={`${styles.combatDeckHeader} ${manuscript ? spread.leafPair : ""}`}>
        <div>
          <span><Swords /> {ru ? "БОЕВАЯ ПАНЕЛЬ" : "COMBAT ACTION BAR"}</span>
          <h3 id="combat-deck-title">{ru ? "Посмотри, как билд играет в бою" : "See how the build plays in combat"}</h3>
          <p>{ru ? "Кулдауны, ресурс и окна проков берутся из журнала SimulationCraft — браузер не придумывает броски." : "Cooldowns, resources, and proc windows come from the SimulationCraft trace; the browser does not invent rolls."}</p>
        </div>
        <div className={`${styles.combatDeckStatus} ${manuscript ? spread.statusLeaf : ""}`} data-exact={exact || undefined}>
          {exact ? <ShieldCheck /> : <TimerReset />}
          <span><small>{personal ? (ru ? "ВАШ ПЕРСОНАЖ" : "YOUR CHARACTER") : exact ? "SIMULATIONCRAFT" : (ru ? "НУЖЕН РАСЧЁТ" : "SIMULATION REQUIRED")}</small><strong>{result ? `${compactDps(result.dps)} ${result.targets > 1 ? (ru ? "суммарный DPS" : "total DPS") : "DPS"}` : (ru ? "DPS ещё не рассчитан" : "DPS not calculated")}</strong></span>
        </div>
      </header>

      <div className={`${styles.encounterProfiles} ${manuscript ? spread.leafPair : ""}`}>
        <div><strong>{ru ? "Готовые профили боя" : "Encounter profiles"}</strong><small>{ru ? "Поддерживаемая APL SimC пересчитается под выбранные условия" : "The maintained SimC APL is recalculated for the selected conditions"}</small></div>
        <div className={manuscript ? spread.encounterChoices : undefined} role="radiogroup" aria-label={ru ? "Профиль боя" : "Encounter profile"}>
          {ENCOUNTERS.map((encounter) => {
            const [name, detail] = encounterText(encounter.id, ru);
            return <button key={encounter.id} type="button" role="radio" aria-checked={activeEncounter === encounter.id} disabled={busy} onClick={() => onEncounter(encounter)}><strong>{name}</strong><small>{detail}</small></button>;
          })}
        </div>
      </div>

      <RotationCursorValueContext.Consumer>{(cursor) => {
        const { next: nextCast } = castsAt(casts, cursor);
        const activeProcs = (result?.procs ?? []).filter((proc) => cursor >= proc.time && cursor <= proc.time + proc.duration);
        const resource = result ? resourceAt(result, cursor) : null;
        return <div className={`${styles.combatDeckReadout} ${manuscript ? spread.readout : ""}`}>
        <div className={deferredLabStyles.combatResource} style={{ "--resource-fill": `${resource?.percent ?? 0}%` } as CSSProperties}>
          <Gauge />
          <span><small>{resource?.label ?? (ru ? "РЕСУРС" : "RESOURCE")}</small><strong>{resource ? `${resource.current} / ${resource.maximum}` : "—"}</strong></span>
          <i><b /></i>
        </div>
        <div className={deferredLabStyles.combatProcRail} aria-live="polite">
          <Sparkles />
          <span><small>{ru ? "АКТИВНЫЕ ПРОКИ И БАФФЫ" : "ACTIVE PROCS & BUFFS"}</small>{activeProcs.length ? <strong>{activeProcs.map((proc) => proc.name).join(" · ")}</strong> : <strong>{result ? (ru ? "Сейчас активных окон нет" : "No active windows now") : (ru ? "Появятся после расчёта" : "Available after simulation")}</strong>}</span>
        </div>
        <div className={deferredLabStyles.combatNextCast}>
          <small>{ru ? "СЛЕДУЮЩЕЕ ДЕЙСТВИЕ" : "NEXT ACTION"}</small>
          <strong>{nextCast ? byId.get(nextCast.abilityId)?.name ?? nextCast.abilityId : "—"}</strong>
        </div>
        </div>;
      }}</RotationCursorValueContext.Consumer>

      <div className={styles.actionBarWorkbench} data-book-open={spellbookOpen || undefined} onKeyDown={(event) => {
        if (bindingMode && bindingPosition === null && event.key === "Escape") {
          event.preventDefault(); setBindingMode(false); bindingToggleRef.current?.focus();
        }
      }}>
        <div className={`${styles.actionBarPanel} ${manuscript ? spread.barSheet : ""}`} data-book-surface={manuscript ? "foldout" : undefined}>
          <div className={`${styles.actionBarToolbar} ${bindingStyles.toolbar}`} data-binding-mode={bindingMode || undefined}>
            <div><strong>{ru ? "Панель персонажа" : "Character action bar"}</strong><small>{ru ? "3 ряда · 36 ячеек · раскладка сохраняется автоматически" : "3 rows · 36 slots · layout saves automatically"}</small></div>
            <span className={styles.actionBarSaveState} data-state={actionBar.syncState}>{!actionBar.ready ? (ru ? "Загрузка раскладки…" : "Loading layout…") : actionBar.syncState === "saving" ? (ru ? "Сохраняем…" : "Saving…") : actionBar.syncState === "offline" ? (ru ? "Сохранено локально" : "Saved locally") : actionBar.syncState === "synced" ? (ru ? "Синхронизировано" : "Synced") : (ru ? "Автосохранение" : "Autosave")}</span>
            <button ref={bindingToggleRef} type="button" className={`${styles.actionBarUtility} ${bindingStyles.toggle}`} aria-pressed={bindingMode} disabled={!actionBar.ready} onClick={() => { setBindingMode(!bindingMode); setBindingPosition(null); setBindingNotice(""); setSpellbookOpen(false); setPlaying(false); }}><Keyboard /><span>{bindingMode ? (ru ? "Готово" : "Done binding") : (ru ? "Клавиши" : "Key bindings")}</span></button>
            <button type="button" className={styles.actionBarUtility} disabled={bindingMode || !actionBar.ready} onClick={actionBar.organize} title={ru ? "Собрать умения по порядку; бинды остаются на своих ячейках" : "Compact abilities; bindings stay with their slots"}><ListOrdered /> <span>{ru ? "Упорядочить" : "Arrange"}</span></button>
            <button type="button" className={styles.actionBarUtility} disabled={bindingMode || !actionBar.ready} onClick={actionBar.reset} title={ru ? "Вернуть исходные умения и клавиши" : "Restore default abilities and key bindings"}><RotateCcw /> <span>{ru ? "Сбросить" : "Reset"}</span></button>
            <button ref={spellbookToggleRef} type="button" className={styles.spellbookToggle} disabled={bindingMode || !actionBar.ready} aria-expanded={spellbookOpen} aria-controls={spellbookOpen ? spellbookId : undefined} onClick={() => spellbookOpen ? closeSpellbook() : openSpellbook()}><BookOpen /> {manuscript ? (spellbookOpen ? (ru ? "Скрыть умения" : "Hide abilities") : (ru ? "Добавить умения" : "Add abilities")) : (spellbookOpen ? (ru ? "Закрыть книгу" : "Close book") : (ru ? "Книга умений" : "Spellbook"))}</button>
          </div>
          {bindingMode && <p className={bindingStyles.modeHint} role="status">{bindingNotice} {ru ? "Выберите любую ячейку ниже, затем нажмите нужную клавишу. Бинд закрепляется за ячейкой. Esc — выйти." : "Select any slot below, then press a key. Bindings stay with their slots. Esc exits."}</p>}
          {bindingMode && bindingPosition !== null && <ActionBarBindingEditor key={bindingPosition} position={bindingPosition} label={labelAt(bindingPosition)} bindings={actionBar.bindings} labelAt={labelAt} ru={ru} manuscript={manuscript} onApply={saveBinding} onClose={closeBinding} />}
          <p className={styles.actionBarScrollHint}>{ru ? "Листайте панель вбок, чтобы увидеть все 12 ячеек →" : "Scroll the bar sideways to see all 12 slots →"}</p>
          <div className={`${styles.wowBarFrame} ${folio.barViewport}`} role="region" tabIndex={0} aria-label={ru ? "Панель умений — прокручивается вбок" : "Action bar — scrolls sideways"}>
            <div className={`${styles.wowBarAssembly} ${folio.assembly}`}>
              <div className={styles.wowBarEndcap} aria-hidden="true" />
              <div className={`${styles.wowBarPlate} ${folio.plate}`}>
                <RotationCursorValueContext.Consumer>{(cursor) => {
                  const { next: nextCast, last: lastCast } = castsAt(casts, cursor);
                  return <div className={`${styles.wowActionRows} ${folio.rows}`}>
                  {Array.from({ length: ACTION_BAR_ROWS }, (_, rowIndex) => <div className={`${deferredLabStyles.actionBarLane} ${folio.lane}`} key={rowIndex}>
                    {manuscript && <span className={folio.rowLabel} aria-hidden="true"><b>{["I", "II", "III"][rowIndex]}</b><small>{ru ? "РЯД" : "ROW"}</small></span>}
                    <div className={`${styles.wowActionBar} ${folio.actionRow}`} role="group" aria-label={ru ? `Панель ${rowIndex + 1}: 12 ячеек` : `Action bar ${rowIndex + 1}: 12 slots`}>
                      {Array.from({ length: ACTION_BAR_COLUMNS }, (_, columnIndex) => {
                        const position = rowIndex * ACTION_BAR_COLUMNS + columnIndex;
                        const slot = slotsByPosition.get(position);
                        const ability = slot ? byId.get(slot.abilityId) : undefined;
                        const cooldown = ability && result ? cooldownAt(cooldownsByAbility.get(ability.id), cursor) : null;
                        const recommended = Boolean(ability && nextCast?.abilityId === ability.id);
                        const justCast = Boolean(ability && lastCast?.abilityId === ability.id && cursor - lastCast.time < .42);
                        const keyLabel = actionBarKeyLabel(actionBar.bindings[position] ?? "") || "—";
                        const bindingLabel = `${ru ? "Назначить клавишу" : "Bind key"}: ${labelAt(position)} (${position + 1})`;
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
          <p className={styles.actionBarHint}>{manuscript ? (ru ? "Нажмите + в пустой ячейке и выберите умение ниже. Или перетащите его прямо из каталога." : "Choose an empty + slot, then select an ability below. Or drag an ability from the catalogue.") : spellbookOpen ? (ru ? "Перетащите умение из книги в любую ячейку. Умения на панели также можно менять местами." : "Drag an ability from the spellbook into any slot. Assigned abilities can also be rearranged.") : (ru ? "Откройте «Книгу умений», чтобы добавить, удалить или переставить способности как в игре." : "Open the Spellbook to add, remove, or rearrange abilities like in game.")}</p>
        </div>
        {spellbookOpen && <div id={spellbookId} className={`${styles.spellbookViewport} ${folio.catalogViewport} ${manuscript ? motion.catalogReveal : ""}`} role="region" aria-label={manuscript ? (ru ? "Каталог умений" : "Ability catalogue") : (ru ? "Книга умений" : "Spellbook")} data-mobile-page={mobileBookPage}>
          {!manuscript && <nav className={styles.spellbookMobileNav} aria-label={ru ? "Страницы книги" : "Book pages"}>
            <button type="button" aria-pressed={mobileBookPage === "index"} onClick={() => setMobileBookPage("index")}>{ru ? "Оглавление" : "Contents"}</button>
            <button type="button" aria-pressed={mobileBookPage === "abilities"} onClick={() => setMobileBookPage("abilities")}>{ru ? "Умения" : "Abilities"}</button>
          </nav>}
          <SpellbookDrawer abilities={abilities} assignedIds={actionBar.assignedIds} lang={lang} presentation={manuscript ? "catalog" : "book"} onClose={closeSpellbook} onAdd={addFromSpellbook} />
        </div>}
      </div>

      <RotationCursorValueContext.Consumer>{(cursor) => <footer className={`${styles.combatPlayback} ${manuscript ? `${spread.foldout} ${spread.playbackSheet}` : ""}`} data-book-surface={manuscript ? "foldout" : undefined}>
        <div>
          <button type="button" disabled={!result || stale} onClick={() => { if (cursor >= duration) onCursor(0); setPlaying((value) => !value); }} aria-label={playing ? (ru ? "Пауза" : "Pause") : (ru ? "Воспроизвести" : "Play")}>{playing ? <Pause /> : <Play />}</button>
          <button type="button" disabled={!result} onClick={() => { setPlaying(false); onCursor(0); }} aria-label={ru ? "В начало" : "Restart"}><RotateCcw /></button>
          <select value={speed} disabled={!result} onChange={(event) => setSpeed(Number(event.target.value))} aria-label={ru ? "Скорость воспроизведения" : "Playback speed"}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </div>
        <label><span>{stamp(cursor)}</span><input type="range" aria-label={ru ? "Позиция в симуляции" : "Simulation position"} min="0" max={duration} step="0.1" value={Math.min(cursor, duration)} disabled={!result} onChange={(event) => { setPlaying(false); onCursor(Number(event.target.value)); }} /><span>{stamp(duration)}</span></label>
        {!result && <button type="button" className={styles.combatRunButton} onClick={onRun} disabled={busy}><Play /> {busy ? (ru ? "Считаем…" : "Calculating…") : (ru ? "Рассчитать и запустить" : "Calculate and play")}</button>}
        {stale && <button type="button" className={styles.combatRunButton} onClick={onRun} disabled={busy}><Play /> {ru ? "Пересчитать изменения" : "Recalculate changes"}</button>}
      </footer>}</RotationCursorValueContext.Consumer>

      <p className={`${styles.combatDeckFootnote} ${manuscript ? spread.leafNotes : ""}`}>{ru ? "В AoE показан суммарный DPS по всем целям — урон не делится поровну между мобами. Цель — стандартный Patchwerk-манекен SimulationCraft, а не любой конкретный NPC. Броня и базовая механика урона учитываются; уникальные иммунитеты, фазы и уязвимости босса требуют отдельного сценария. Нажатие на способность только перематывает журнал и не отправляет клавиши в WoW." : "AoE shows total DPS across every target; damage is not divided equally per mob. The target is SimulationCraft’s standard Patchwerk target, not every specific NPC. Armor and baseline damage mechanics are included; a boss’s unique immunities, phases, and vulnerabilities require a dedicated encounter script. Clicking an ability only seeks the trace and never sends keys to WoW."}</p>
    </section>
  );
}
