import type { RotationAbility } from "@/lib/platform/rotation/types";
import { actionBindingLabel, normalizeActionBinding } from "./actionBarBindings.ts";

export type TrainerDrill = "combo" | "burst" | "priority";
export type TrainerSlot = { abilityId: string; key: string; position: number };
export type ActionBarSettings = { slots: TrainerSlot[]; drill: TrainerDrill; duration: number; bindings?: string[] };

export const ACTION_BAR_COLUMNS = 12;
export const ACTION_BAR_ROWS = 3;
export const ACTION_BAR_SLOT_COUNT = ACTION_BAR_COLUMNS * ACTION_BAR_ROWS;
export const ACTION_BAR_KEYS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=",
  "Shift+1", "Shift+2", "Shift+3", "Shift+4", "Shift+5", "Shift+6", "Shift+7", "Shift+8", "Shift+9", "Shift+0", "Shift+-", "Shift+=",
  "Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9", "Ctrl+0", "Ctrl+-", "Ctrl+=",
] as const;

export const actionBarKeyLabel = actionBindingLabel;

const initialBindings = (): string[] => Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, position) => ACTION_BAR_KEYS[position] ?? "");

/**
 * Return the physical slot bindings, including empty slots. Explicit saved
 * bindings win over defaults even if their position is later in the bar.
 */
export function actionBarBindings(settings: Pick<ActionBarSettings, "slots" | "bindings">): string[] {
  const bindings = initialBindings();
  const explicit = new Map<number, string>();
  if (Array.isArray(settings.bindings)) {
    for (let position = 0; position < Math.min(settings.bindings.length, ACTION_BAR_SLOT_COUNT); position += 1) {
      if (!Object.prototype.hasOwnProperty.call(settings.bindings, position)) continue;
      explicit.set(position, normalizeActionBinding(settings.bindings[position]) ?? "");
    }
  }
  if (Array.isArray(settings.slots)) {
    for (const slot of settings.slots) {
      if (!slot || !Number.isInteger(slot.position) || slot.position < 0 || slot.position >= ACTION_BAR_SLOT_COUNT || explicit.has(slot.position) || typeof slot.key !== "string") continue;
      explicit.set(slot.position, normalizeActionBinding(slot.key) ?? "");
    }
  }
  for (const [position, binding] of explicit) bindings[position] = binding;

  const claimed = new Set<string>();
  const unique = (position: number) => {
    const binding = bindings[position];
    if (!binding) return;
    if (claimed.has(binding)) bindings[position] = "";
    else claimed.add(binding);
  };
  [...explicit.keys()].sort((left, right) => left - right).forEach(unique);
  for (let position = 0; position < ACTION_BAR_SLOT_COUNT; position += 1) {
    if (!explicit.has(position)) unique(position);
  }
  return bindings;
}

/** Assigns a key to a fixed slot; a conflicting old slot becomes unbound. */
export function assignActionBarBinding(settings: ActionBarSettings, position: number, key: string): ActionBarSettings {
  if (!Number.isInteger(position) || position < 0 || position >= ACTION_BAR_SLOT_COUNT) return settings;
  const binding = normalizeActionBinding(key);
  if (binding === null) return settings;
  const bindings = actionBarBindings(settings);
  if (binding) {
    for (let index = 0; index < bindings.length; index += 1) {
      if (index !== position && bindings[index] === binding) bindings[index] = "";
    }
  }
  bindings[position] = binding;
  return { ...settings, bindings, slots: settings.slots.map((slot) => ({ ...slot, key: bindings[slot.position] ?? "" })) };
}

export function defaultActionBarSlots(abilities: RotationAbility[], rules: string[], slug: string) {
  const furyPreferred = ["recklessness", "avatar", "odyns-fury", "rampage", "bloodthirst", "raging-blow", "execute", "whirlwind"];
  const preferred = slug === "fury-warrior"
    ? [...furyPreferred, ...rules, ...abilities.map((ability) => ability.id)]
    : [...rules, ...abilities.map((ability) => ability.id)];
  const available = new Set(abilities.map((ability) => ability.id));
  const seen = new Set<string>();
  return preferred
    .filter((id) => available.has(id) && !seen.has(id) && Boolean(seen.add(id)))
    .slice(0, 12)
    .map((abilityId, position) => ({ abilityId, position, key: ACTION_BAR_KEYS[position] ?? "" }));
}

export function validateActionBarSettings(value: unknown, abilities: RotationAbility[], defaults: TrainerSlot[]): ActionBarSettings {
  const parsed = value && typeof value === "object"
    ? value as { slots?: unknown; bindings?: unknown; drill?: TrainerDrill; duration?: number }
    : {};
  const validIds = new Set(abilities.map((ability) => ability.id));
  const positions = new Set<number>();
  const abilityIds = new Set<string>();
  const sourceSlots: unknown[] = Array.isArray(parsed.slots) ? parsed.slots : defaults;
  const slots = sourceSlots.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const slot = entry as Partial<TrainerSlot>;
    if (typeof slot.abilityId !== "string" || !validIds.has(slot.abilityId) || abilityIds.has(slot.abilityId)) return [];
    const candidate = Number.isInteger(slot.position) ? Number(slot.position) : index;
    const position = candidate >= 0 && candidate < ACTION_BAR_SLOT_COUNT && !positions.has(candidate)
      ? candidate
      : Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, item) => item).find((item) => !positions.has(item));
    if (position === undefined) return [];
    positions.add(position);
    abilityIds.add(slot.abilityId);
    return [{ abilityId: slot.abilityId, position, key: typeof slot.key === "string" ? slot.key : ACTION_BAR_KEYS[position] ?? "" }];
  }).sort((left, right) => left.position - right.position);
  const bindings = actionBarBindings({ slots, bindings: Array.isArray(parsed.bindings) ? parsed.bindings : undefined });
  return {
    slots: slots.map((slot) => ({ ...slot, key: bindings[slot.position] ?? "" })),
    bindings,
    drill: parsed.drill === "combo" || parsed.drill === "priority" || parsed.drill === "burst" ? parsed.drill : "burst",
    duration: parsed.duration && [30, 60, 120].includes(parsed.duration) ? parsed.duration : 30,
  };
}

export const actionBarStorageKey = (slug: string, storageScope: string) => `gildra:rotation-trainer:${slug}:${storageScope}:v3`;
