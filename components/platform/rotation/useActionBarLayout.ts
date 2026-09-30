"use client";

import { useEffect, useMemo } from "react";
import type { RotationAbility } from "@/lib/platform/rotation/types";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import {
  ACTION_BAR_KEYS,
  ACTION_BAR_SLOT_COUNT,
  actionBarStorageKey,
  defaultActionBarSlots,
  validateActionBarSettings,
  assignActionBarBinding,
  type ActionBarSettings,
  type TrainerSlot,
} from "./actionBarLayout";

export function useActionBarLayout({ abilities, rules, slug, storageScope, characterSlug, dataMode }: {
  abilities: RotationAbility[];
  rules: string[];
  slug: string;
  storageScope: string;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
}) {
  const defaults = useMemo(() => defaultActionBarSlots(abilities, rules, slug), [abilities, rules, slug]);
  const initialValue = useMemo(() => validateActionBarSettings({ slots: defaults }, abilities, defaults), [abilities, defaults]);
  const workspace = useCharacterWorkspaceDocument<ActionBarSettings>({
    enabled: dataMode === "battle-net" && Boolean(characterSlug),
    characterSlug: characterSlug ?? "reference--reference--reference",
    specializationSlug: slug,
    kind: "trainer-settings",
    localStorageKey: actionBarStorageKey(slug, storageScope),
    initialValue,
    validate: (value) => validateActionBarSettings(value, abilities, defaults),
  });
  const slots = workspace.value.slots;
  const bindings = workspace.value.bindings ?? [...ACTION_BAR_KEYS];
  const abilitySignature = useMemo(() => abilities.map((ability) => ability.id).sort().join("|"), [abilities]);
  useEffect(() => {
    if (!workspace.hydrated) return;
    const available = new Set(abilitySignature.split("|").filter(Boolean));
    workspace.setValue((current) => {
      const nextSlots = current.slots.filter((slot) => available.has(slot.abilityId));
      return nextSlots.length === current.slots.length ? current : { ...current, slots: nextSlots };
    });
  }, [abilitySignature, workspace.hydrated]);
  const assignedIds = useMemo(() => new Set(slots.map((slot) => slot.abilityId)), [slots]);

  const setSlots = (update: (current: TrainerSlot[], keys: readonly string[]) => TrainerSlot[]) => {
    if (!workspace.hydrated) return;
    workspace.setValue((current) => ({ ...current, slots: update(current.slots, current.bindings ?? ACTION_BAR_KEYS) }));
  };
  const removeAt = (position: number) => setSlots((current) => current.filter((slot) => slot.position !== position));
  const placeAbility = (abilityId: string, preferredPosition?: number) => setSlots((current, keys) => {
    if (!abilities.some((ability) => ability.id === abilityId)) return current;
    const currentSlot = current.find((slot) => slot.abilityId === abilityId);
    const occupied = new Map(current.map((slot) => [slot.position, slot]));
    const openPosition = Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) => index).find((index) => !occupied.has(index));
    const target = preferredPosition ?? openPosition;
    if (target === undefined || target < 0 || target >= ACTION_BAR_SLOT_COUNT || (!currentSlot && current.length >= ACTION_BAR_SLOT_COUNT)) return current;
    if (currentSlot?.position === target) return current;
    const destination = occupied.get(target);
    const sourcePosition = currentSlot?.position;
    const next = current.filter((slot) => slot.abilityId !== abilityId && slot.position !== target).map((slot) => ({ ...slot }));
    const destinationKey = keys[target] ?? "";
    next.push({ abilityId, position: target, key: destinationKey });
    if (destination) {
      const displacedPosition = sourcePosition ?? openPosition;
      if (displacedPosition !== undefined && displacedPosition !== target) {
        const sourceKey = keys[displacedPosition] ?? "";
        next.push({ ...destination, position: displacedPosition, key: sourceKey });
      }
    }
    return next.sort((left, right) => left.position - right.position);
  });
  const reset = () => { if (workspace.hydrated) workspace.setValue((current) => ({ ...current, slots: defaults, bindings: [...ACTION_BAR_KEYS] })); };
  const bindAt = (position: number, key: string) => { if (workspace.hydrated) workspace.setValue((current) => assignActionBarBinding(current, position, key)); };
  const organize = () => setSlots((current, keys) => [...current]
    .sort((left, right) => left.position - right.position)
    .map((slot, position) => ({ ...slot, position, key: keys[position] ?? "" })));

  return { slots, bindings, assignedIds, placeAbility, removeAt, organize, reset, bindAt, ready: workspace.hydrated, syncState: workspace.syncState, syncMessage: workspace.message };
}
