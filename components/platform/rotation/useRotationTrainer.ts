"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RotationAbility, RotationSequenceSource } from "@/lib/platform/rotation/types";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import { ACTION_BAR_KEYS, ACTION_BAR_SLOT_COUNT, actionBarBindings, assignActionBarBinding, actionBarStorageKey, defaultActionBarSlots, validateActionBarSettings, type ActionBarSettings, type TrainerDrill, type TrainerSlot } from "./actionBarLayout";
import { bindingFromKeyboardEvent, bindingFromMouseEvent, bindingFromWheelEvent } from "./actionBarBindings";

export type { TrainerDrill, TrainerSlot } from "./actionBarLayout";
export type TrainerPhase = "ready" | "countdown" | "running" | "paused" | "complete";

type TrainerState = {
  phase: TrainerPhase;
  countdown: number;
  step: number;
  correct: number;
  mistakes: number;
  streak: number;
  bestStreak: number;
  rounds: number;
  remainingMs: number;
  elapsedMs: number;
  elapsedBeforeRun: number;
  startedAt: number;
  lastCorrectAt: number;
  reactionTotalMs: number;
  reactionCount: number;
  lastPressedId: string | null;
  lastPressCorrect: boolean | null;
};

const FURY_BURST_SEQUENCE = ["recklessness", "avatar", "odyns-fury", "rampage", "bloodthirst", "raging-blow", "rampage", "execute"];

function freshState(duration: number): TrainerState {
  return {
    phase: "ready", countdown: 3, step: 0, correct: 0, mistakes: 0, streak: 0,
    bestStreak: 0, rounds: 0, remainingMs: duration * 1000, elapsedMs: 0,
    elapsedBeforeRun: 0, startedAt: 0, lastCorrectAt: 0, reactionTotalMs: 0,
    reactionCount: 0, lastPressedId: null, lastPressCorrect: null,
  };
}

export function useRotationTrainer({ abilities, rules, slug, storageScope, characterSlug, dataMode, referenceDps, referenceApm, referenceSequence, referenceSequenceSource = "simulation-trace", comboSequence, comboSequenceSource = "saved-combo" }: {
  abilities: RotationAbility[];
  rules: string[];
  slug: string;
  storageScope: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
  referenceDps?: number | null;
  referenceApm?: number | null;
  referenceSequence?: string[];
  referenceSequenceSource?: RotationSequenceSource;
  comboSequence?: string[];
  comboSequenceSource?: RotationSequenceSource;
}) {
  const defaultSlots = useMemo<TrainerSlot[]>(() => defaultActionBarSlots(abilities, rules, slug), [abilities, rules, slug]);
  const storageKey = actionBarStorageKey(slug, storageScope);
  const initialSettings = useMemo(() => validateActionBarSettings({ slots: defaultSlots, drill: "burst", duration: 30 }, abilities, defaultSlots), [abilities, defaultSlots]);
  const validateSettings = (value: unknown) => validateActionBarSettings(value, abilities, defaultSlots);
  const workspace = useCharacterWorkspaceDocument<ActionBarSettings>({
    enabled: dataMode === "battle-net" && Boolean(characterSlug), characterSlug: characterSlug ?? "reference--reference--reference", specializationSlug: slug,
    kind: "trainer-settings", localStorageKey: storageKey, initialValue: initialSettings, validate: validateSettings,
  });
  const { slots, drill, duration } = workspace.value;
  const setSlots = (update: (current: TrainerSlot[], bindings: string[]) => TrainerSlot[]) => { if (!workspace.hydrated) return; workspace.setValue((current) => {
    const bindings = actionBarBindings(current);
    return { ...current, bindings, slots: update(current.slots, bindings) };
  }); };
  const setDrillState = (next: TrainerDrill) => { if (workspace.hydrated) workspace.setValue((current) => ({ ...current, drill: next })); };
  const setDurationState = (next: number) => { if (workspace.hydrated) workspace.setValue((current) => ({ ...current, duration: next })); };
  const [state, setState] = useState(() => freshState(30));
  const inputRef = useRef<HTMLElement>(null);

  const sequence = useMemo(() => {
    const available = new Set(abilities.map((ability) => ability.id));
    const genericBurst = [...rules.slice(0, 3), ...rules, ...rules.slice(0, 2)].slice(0, 12);
    const burst = slug === "fury-warrior" ? FURY_BURST_SEQUENCE : genericBurst;
    const source = drill === "combo" && comboSequence?.length ? comboSequence : drill === "burst" ? burst : referenceSequence?.length ? referenceSequence : rules;
    return source.filter((id) => available.has(id));
  }, [abilities, comboSequence, drill, referenceSequence, rules, slug]);
  const sequenceSource: RotationSequenceSource = drill === "combo" && comboSequence?.length ? comboSequenceSource : drill === "burst" ? "burst-preset" : referenceSequence?.length ? referenceSequenceSource : "custom-apl";
  const sequenceIds = useMemo(() => new Set(sequence), [sequence]);
  const boundIds = useMemo(() => new Set(slots.filter((slot) => slot.key).map((slot) => slot.abilityId)), [slots]);
  const missingAbilityIds = useMemo(() => [...sequenceIds].filter((id) => !boundIds.has(id)), [boundIds, sequenceIds]);
  const hasEmptyBindings = slots.some((slot) => sequenceIds.has(slot.abilityId) && !slot.key);
  const hasDuplicateBindings = new Set(slots.filter((slot) => slot.key).map((slot) => slot.key)).size !== slots.filter((slot) => slot.key).length;
  const canStart = workspace.hydrated && sequence.length > 0 && missingAbilityIds.length === 0 && !hasEmptyBindings && !hasDuplicateBindings;

  const resetSession = useCallback((nextDuration = duration) => setState(freshState(nextDuration)), [duration]);

  useEffect(() => {
    if (!workspace.hydrated || !comboSequence?.length) return;
    setDrillState("combo");
    setState(freshState(duration));
  }, [comboSequence, duration, workspace.hydrated]);

  useEffect(() => {
    if (state.phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      setState((current) => current.phase !== "countdown" ? current : current.countdown > 1
        ? { ...current, countdown: current.countdown - 1 }
        : { ...current, phase: "running", countdown: 0, startedAt: performance.now(), lastCorrectAt: 0 });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state.countdown, state.phase]);

  useEffect(() => {
    if (state.phase !== "running") return;
    const timer = window.setInterval(() => {
      const now = performance.now();
      setState((current) => {
        if (current.phase !== "running") return current;
        const elapsedMs = current.elapsedBeforeRun + now - current.startedAt;
        const remainingMs = Math.max(0, duration * 1000 - elapsedMs);
        return { ...current, elapsedMs, remainingMs, phase: remainingMs === 0 ? "complete" : "running" };
      });
      // The UI clock is displayed in whole seconds; 4 updates per second keep
      // the timer and live APM responsive without rerendering the full trainer
      // tree ten times per second. Input reaction times use performance.now().
    }, 250);
    return () => window.clearInterval(timer);
  }, [duration, state.phase]);

  const pause = useCallback(() => setState((current) => {
    if (current.phase !== "running") return current;
    const elapsedMs = current.elapsedBeforeRun + performance.now() - current.startedAt;
    return { ...current, phase: "paused", elapsedMs, elapsedBeforeRun: elapsedMs, remainingMs: Math.max(0, duration * 1000 - elapsedMs) };
  }), [duration]);
  const resume = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
    setState((current) => current.phase === "paused"
      ? { ...current, phase: "running", startedAt: performance.now(), lastCorrectAt: 0 }
      : current);
  }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);

  const press = useCallback((abilityId: string) => {
    setState((current) => {
      if (current.phase !== "running" || sequence.length === 0) return current;
      const now = performance.now();
      const correct = sequence[current.step] === abilityId;
      if (!correct) return { ...current, mistakes: current.mistakes + 1, streak: 0, lastPressedId: abilityId, lastPressCorrect: false };
      const nextStep = (current.step + 1) % sequence.length;
      const reaction = current.lastCorrectAt ? now - current.lastCorrectAt : 0;
      const streak = current.streak + 1;
      return {
        ...current,
        step: nextStep,
        correct: current.correct + 1,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        rounds: current.rounds + (nextStep === 0 ? 1 : 0),
        lastCorrectAt: now,
        reactionTotalMs: current.reactionTotalMs + reaction,
        reactionCount: current.reactionCount + (reaction ? 1 : 0),
        lastPressedId: abilityId,
        lastPressCorrect: true,
      };
    });
  }, [sequence]);

  useEffect(() => {
    if (state.phase !== "running") return;
    const isEditing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input,select,textarea,[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='combobox'],[data-binding-editor]"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditing(event.target)) return;
      if (event.code === "Escape") { event.preventDefault(); pause(); return; }
      const control = event.target instanceof Element ? event.target.closest("button,a,[role='button'],summary") : null;
      if (control && !control.hasAttribute("data-trainer-cast") && ["Space", "Enter", "Tab"].includes(event.code)) return;
      const binding = bindingFromKeyboardEvent(event);
      const slot = binding ? slots.find((item) => item.key === binding) : undefined;
      if (!slot) return;
      event.preventDefault();
      press(slot.abilityId);
    };
    const pointerSlot = (event: MouseEvent | WheelEvent, binding: string | null) => {
      if (!binding || event.defaultPrevented || !(event.target instanceof Element) || isEditing(event.target)) return undefined;
      const control = event.target.closest("button,a,[role='button'],summary");
      // Only training skill buttons are a cast surface. Pause, config, links
      // and the rest of the page keep their native mouse/wheel interactions.
      if (control && !control.hasAttribute("data-trainer-cast")) return undefined;
      return slots.find((item) => item.key === binding);
    };
    const onMouseDown = (event: MouseEvent) => {
      const slot = pointerSlot(event, bindingFromMouseEvent(event));
      if (!slot) return;
      event.preventDefault();
      press(slot.abilityId);
    };
    const onWheel = (event: WheelEvent) => {
      const slot = pointerSlot(event, bindingFromWheelEvent(event));
      if (!slot) return;
      event.preventDefault();
      press(slot.abilityId);
    };
    const preventAssignedMouseDefault = (event: MouseEvent) => {
      if (pointerSlot(event, bindingFromMouseEvent(event))) event.preventDefault();
    };
    const surface = inputRef.current;
    window.addEventListener("keydown", onKeyDown);
    surface?.addEventListener("mousedown", onMouseDown);
    surface?.addEventListener("wheel", onWheel, { passive: false });
    surface?.addEventListener("contextmenu", preventAssignedMouseDefault);
    surface?.addEventListener("auxclick", preventAssignedMouseDefault);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      surface?.removeEventListener("mousedown", onMouseDown);
      surface?.removeEventListener("wheel", onWheel);
      surface?.removeEventListener("contextmenu", preventAssignedMouseDefault);
      surface?.removeEventListener("auxclick", preventAssignedMouseDefault);
    };
  }, [pause, press, slots, state.phase]);

  const start = () => {
    if (!canStart) return;
    inputRef.current?.focus({ preventScroll: true });
    setState({ ...freshState(duration), phase: "countdown", countdown: 3 });
  };
  const stop = () => setState((current) => ({ ...current, phase: "complete" }));
  const setDrill = (value: TrainerDrill) => { setDrillState(value); resetSession(); };
  const setDuration = (value: number) => { setDurationState(value); resetSession(value); };
  const updateSlot = (index: number, patch: Partial<TrainerSlot>) => {
    if (!workspace.hydrated) return;
    resetSession();
    workspace.setValue((current) => {
      if (!current.slots[index]) return current;
      const next = current.slots.map((slot) => ({ ...slot }));
      if (patch.abilityId) {
        const duplicate = next.findIndex((slot, slotIndex) => slotIndex !== index && slot.abilityId === patch.abilityId);
        if (duplicate >= 0) [next[index].abilityId, next[duplicate].abilityId] = [next[duplicate].abilityId, next[index].abilityId];
        else next[index].abilityId = patch.abilityId;
      }
      if (patch.key !== undefined) {
        return assignActionBarBinding({ ...current, slots: next }, next[index].position, patch.key);
      }
      return { ...current, slots: next };
    });
  };
  const moveSlot = (index: number, direction: -1 | 1) => {
    resetSession();
    setSlots((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = current.map((slot) => ({ ...slot }));
      [next[index].abilityId, next[target].abilityId] = [next[target].abilityId, next[index].abilityId];
      return next;
    });
  };
  const removeSlot = (index: number) => { resetSession(); setSlots((current) => current.length <= 4 ? current : current.filter((_, slotIndex) => slotIndex !== index)); };
  const addSlot = () => {
    const unused = abilities.find((ability) => !slots.some((slot) => slot.abilityId === ability.id));
    if (!unused || slots.length >= ACTION_BAR_SLOT_COUNT) return;
    resetSession();
    setSlots((current, bindings) => {
      const occupied = new Set(current.map((slot) => slot.position));
      const position = Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) => index).find((index) => !occupied.has(index));
      if (position === undefined) return current;
      const key = bindings[position] ?? "";
      return [...current, { abilityId: unused.id, key, position }].sort((left, right) => left.position - right.position);
    });
  };
  const resetLayout = () => { if (!workspace.hydrated) return; workspace.setValue((current) => ({ ...current, slots: defaultSlots, bindings: [...ACTION_BAR_KEYS] })); resetSession(); };

  const total = state.correct + state.mistakes;
  const accuracy = total ? state.correct / total : 1;
  const effectiveApm = state.elapsedMs > 500 ? (state.correct / state.elapsedMs) * 60000 : 0;
  const dpsBaseline = referenceDps && referenceDps > 0 ? referenceDps : null;
  const apmBaseline = referenceApm ?? 60;
  const pace = apmBaseline && apmBaseline > 0 ? Math.min(1.1, effectiveApm / apmBaseline) : 0;
  return {
    slots, inputRef, hydrated: workspace.hydrated, sequence, sequenceSource, drill, duration, state, canStart, missingAbilityIds, hasEmptyBindings, hasDuplicateBindings,
    expectedId: sequence[state.step] ?? null,
    accuracy: Math.round(accuracy * 100),
    apm: Math.round(effectiveApm),
    inputApm: state.elapsedMs > 500 ? Math.round((total / state.elapsedMs) * 60000) : 0,
    averageReaction: state.reactionCount ? Math.round(state.reactionTotalMs / state.reactionCount) : 0,
    trainingDps: dpsBaseline && pace > 0 ? Math.round(dpsBaseline * accuracy * pace) : null,
    storageKey,
    start, stop, pause, resume, press, setDrill, setDuration, resetSession, updateSlot, moveSlot, removeSlot, addSlot, resetLayout,
  };
}
