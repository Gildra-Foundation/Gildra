/**
 * Action-bar bindings describe physical inputs, not the character produced by
 * the current keyboard layout. Keep the stored spelling compatible with the
 * trainer's existing `Ctrl+Shift+1`-style keys.
 */
type BindingModifiers = {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

export type ActionKeyboardBindingEvent = BindingModifiers & {
  code: string;
  key?: string;
  isComposing?: boolean;
  keyCode?: number;
  getModifierState?: (key: string) => boolean;
};

export type ActionMouseBindingEvent = BindingModifiers & { button: number };
export type ActionWheelBindingEvent = BindingModifiers & { deltaY: number };

const CODE_BASES: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  CapsLock: "CapsLock",
  NumLock: "NumLock",
  ScrollLock: "ScrollLock",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "IntlBackslash",
  IntlRo: "IntlRo",
  IntlYen: "IntlYen",
  NumpadAdd: "NumAdd",
  NumpadSubtract: "NumSubtract",
  NumpadMultiply: "NumMultiply",
  NumpadDivide: "NumDivide",
  NumpadDecimal: "NumDecimal",
  NumpadEnter: "NumEnter",
  NumpadEqual: "NumEqual",
  NumpadComma: "NumComma",
};

const KEY_BASES = new Map<string, string>([
  ...Object.entries(CODE_BASES).map(([code, base]) => [code.toLowerCase(), base] as const),
  ...Object.values(CODE_BASES).map((base) => [base.toLowerCase(), base] as const),
  ["spacebar", "Space"],
  ["esc", "Escape"],
  ["return", "Enter"],
  ["del", "Delete"],
  ["pgup", "PageUp"],
  ["pgdn", "PageDown"],
  ["numplus", "NumAdd"],
  ["numminus", "NumSubtract"],
  ["numdot", "NumDecimal"],
]);

const PUNCTUATION = new Set(["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"]);
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const MODIFIER_NAMES: Record<string, typeof MODIFIER_ORDER[number]> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  win: "Meta",
};

function canonicalBase(input: string): string | null {
  const value = input.trim();
  if (/^[a-z]$/i.test(value)) return value.toUpperCase();
  if (/^[0-9]$/.test(value) || PUNCTUATION.has(value)) return value;
  const keyCode = /^Key([a-z])$/i.exec(value);
  if (keyCode) return keyCode[1].toUpperCase();
  const digitCode = /^Digit([0-9])$/i.exec(value);
  if (digitCode) return digitCode[1];
  const numpadDigit = /^(?:Num|Numpad)([0-9])$/i.exec(value);
  if (numpadDigit) return `Num${numpadDigit[1]}`;
  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/i.exec(value);
  if (functionKey) return `F${functionKey[1]}`;
  if (/^Mouse[2-5]$/i.test(value)) return `Mouse${value.slice(-1)}`;
  if (/^Wheel(?:Up|Down)$/i.test(value)) return `Wheel${value.slice(5).toLowerCase() === "up" ? "Up" : "Down"}`;
  const mapped = KEY_BASES.get(value.toLowerCase());
  return mapped && mapped !== "Escape" ? mapped : null;
}

function withModifiers(base: string, event: BindingModifiers): string {
  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
    base,
  ].filter(Boolean).join("+");
}

/** Returns null for unsupported input; an empty string intentionally unbinds. */
export function normalizeActionBinding(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const raw = value.trim();
  if (!raw) return "";
  const parts = raw.split("+").map((part) => part.trim());
  if (parts.some((part) => !part) || parts.length > MODIFIER_ORDER.length + 1) return null;
  const base = canonicalBase(parts.pop() ?? "");
  if (!base) return null;
  const modifiers = new Set<typeof MODIFIER_ORDER[number]>();
  for (const part of parts) {
    const modifier = MODIFIER_NAMES[part.toLowerCase()];
    if (!modifier || modifiers.has(modifier)) return null;
    modifiers.add(modifier);
  }
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), base].join("+");
}

export function bindingFromKeyboardEvent(event: ActionKeyboardBindingEvent): string | null {
  if (event.isComposing || event.keyCode === 229 || event.key === "Process" || event.key === "Dead" || event.getModifierState?.("AltGraph")) return null;
  const code = event.code;
  if (!code || code === "Escape" || /^(?:Control|Alt|Shift|Meta|OS)(?:Left|Right)$/.test(code)) return null;
  const base = canonicalBase(code);
  return base ? withModifiers(base, event) : null;
}

export function bindingFromMouseEvent(event: ActionMouseBindingEvent): string | null {
  const base = ({ 1: "Mouse3", 2: "Mouse2", 3: "Mouse4", 4: "Mouse5" } as Record<number, string>)[event.button];
  return base ? withModifiers(base, event) : null;
}

export function bindingFromWheelEvent(event: ActionWheelBindingEvent): string | null {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return null;
  return withModifiers(event.deltaY < 0 ? "WheelUp" : "WheelDown", event);
}

/** Compact universal label for a slot badge (not a translated description). */
export function actionBindingLabel(binding: string): string {
  const normalized = normalizeActionBinding(binding);
  if (!normalized) return "—";
  const parts = normalized.split("+");
  const base = parts.pop() ?? "";
  const baseLabel: Record<string, string> = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    PageUp: "PgUp", PageDown: "PgDn", Backspace: "Bksp", Delete: "Del",
    Insert: "Ins", Enter: "Enter", Space: "Space", Tab: "Tab",
    CapsLock: "Caps", NumLock: "NumLock", ScrollLock: "ScrollLock",
    Mouse2: "RMB", Mouse3: "MMB", Mouse4: "M4", Mouse5: "M5",
    WheelUp: "Wheel↑", WheelDown: "Wheel↓",
    NumAdd: "Num+", NumSubtract: "Num−", NumMultiply: "Num×", NumDivide: "Num÷",
    NumDecimal: "Num.", NumEnter: "Num↵", NumEqual: "Num=", NumComma: "Num,",
  };
  const modifierLabel: Record<string, string> = { Ctrl: "⌃", Alt: "Alt", Shift: "⇧", Meta: "⌘" };
  return [...parts.map((part) => modifierLabel[part] ?? part), baseLabel[base] ?? base].join("+");
}

/** Browsers and operating systems can consume these before a page sees them. */
export function isRiskyActionBinding(binding: string): boolean {
  const normalized = normalizeActionBinding(binding);
  if (!normalized) return false;
  if (["Tab", "Shift+Tab", "F5", "Ctrl+Tab", "Ctrl+Shift+Tab", "Meta+Tab", "Alt+F4", "Meta+Q"].includes(normalized)) return true;
  if (/^(?:Ctrl|Meta)\+(?:R|W|T|N|L|P|S|F4)$/.test(normalized)) return true;
  if (/^(?:Ctrl|Meta)\+Shift\+T$/.test(normalized)) return true;
  return ["Alt+ArrowLeft", "Alt+ArrowRight", "Mouse2", "Mouse3"].includes(normalized);
}
