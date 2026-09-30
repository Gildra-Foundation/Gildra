type KeyboardBindingEvent = Pick<
  KeyboardEvent,
  "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
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
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Enter: "Enter",
};

const IGNORED_CODES = new Set([
  "Tab", "Escape", "CapsLock", "NumLock", "ScrollLock",
  "MetaLeft", "MetaRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "ShiftLeft", "ShiftRight",
]);

export function keyBindingFromEvent(event: KeyboardBindingEvent): string | null {
  if (IGNORED_CODES.has(event.code)) return null;

  let base = KEY_LABELS[event.code];
  if (!base && event.code.startsWith("Key")) base = event.code.slice(3);
  if (!base && event.code.startsWith("Digit")) base = event.code.slice(5);
  if (!base && event.code.startsWith("Numpad")) base = `Num${event.code.slice(6)}`;
  if (!base && /^F\d{1,2}$/.test(event.code)) base = event.code;
  if (!base && event.key.length <= 2) base = event.key.toUpperCase();
  if (!base) return null;

  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
  ].filter(Boolean);
  return [...modifiers, base].join("+");
}

export function keyBindingFromMouseButton(button: number): string | null {
  if (button === 3) return "Mouse4";
  if (button === 4) return "Mouse5";
  return null;
}

export function isRiskyBrowserBinding(binding: string): boolean {
  return new Set([
    "Ctrl+R", "Ctrl+W", "Ctrl+T", "Ctrl+N", "Ctrl+L", "Ctrl+P", "Ctrl+S",
    "Meta+R", "Meta+W", "Meta+T", "Meta+N", "Meta+L", "Meta+P", "Meta+S",
    "Alt+ArrowLeft", "Alt+ArrowRight", "F5",
  ]).has(binding);
}
