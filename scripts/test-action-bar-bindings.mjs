import assert from "node:assert/strict";
import {
  actionBindingLabel,
  bindingFromKeyboardEvent,
  bindingFromMouseEvent,
  bindingFromWheelEvent,
  isRiskyActionBinding,
  normalizeActionBinding,
} from "../components/platform/rotation/actionBarBindings.ts";
import {
  ACTION_BAR_KEYS,
  ACTION_BAR_SLOT_COUNT,
  actionBarBindings,
  assignActionBarBinding,
  validateActionBarSettings,
} from "../components/platform/rotation/actionBarLayout.ts";

const modifiers = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
const abilities = ["first", "second", "third", "fourth"].map((id) => ({ id }));
const defaults = [{ abilityId: "first", position: 0, key: "1" }];

assert.equal(normalizeActionBinding(""), "");
assert.equal(normalizeActionBinding("  shift + ctrl + keya "), "Ctrl+Shift+A");
assert.equal(normalizeActionBinding("Ctrl+Alt+Numpad7"), "Ctrl+Alt+Num7");
assert.equal(normalizeActionBinding("meta+f24"), "Meta+F24");
assert.equal(normalizeActionBinding("Alt+Mouse4"), "Alt+Mouse4");
assert.equal(normalizeActionBinding("Shift+WheelDown"), "Shift+WheelDown");
for (const unsupported of [null, 12, "Ctrl+", "Ctrl+Ctrl+A", "F25", "Mouse1", "Escape", "KeyЯ", "Ctrl+javascript:alert(1)"]) {
  assert.equal(normalizeActionBinding(unsupported), null, `Unsupported binding was accepted: ${String(unsupported)}`);
}

assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "KeyQ", key: "й" }), "Q", "Cyrillic keyboard layout must use physical code");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "Digit2", key: "@", shiftKey: true }), "Shift+2");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "BracketLeft", key: "х", ctrlKey: true }), "Ctrl+[");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "NumpadAdd", key: "+" }), "NumAdd");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "F24", key: "F24" }), "F24");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "Tab", key: "Tab" }), "Tab");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "CapsLock", key: "CapsLock" }), "CapsLock");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "NumLock", key: "NumLock" }), "NumLock");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "ScrollLock", key: "ScrollLock" }), "ScrollLock");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "Space", key: " " }), "Space");
assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: "ArrowLeft", key: "ArrowLeft", altKey: true }), "Alt+ArrowLeft");
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: `Key${letter}`, key: "я" }), letter);
}
for (const digit of "0123456789") {
  assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: `Digit${digit}`, key: "!" }), digit);
  assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: `Numpad${digit}`, key: digit }), `Num${digit}`);
}
for (let number = 1; number <= 24; number += 1) {
  assert.equal(bindingFromKeyboardEvent({ ...modifiers, code: `F${number}`, key: `F${number}` }), `F${number}`);
}
for (const [code, expected] of Object.entries({
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  NumpadAdd: "NumAdd", NumpadSubtract: "NumSubtract", NumpadMultiply: "NumMultiply",
  NumpadDivide: "NumDivide", NumpadDecimal: "NumDecimal", NumpadEnter: "NumEnter",
  ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowRight: "ArrowRight",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  Insert: "Insert", Delete: "Delete", Backspace: "Backspace", Enter: "Enter",
})) {
  assert.equal(bindingFromKeyboardEvent({ ...modifiers, code, key: "ю" }), expected, `Physical code ${code} was not preserved`);
  assert.equal(normalizeActionBinding(expected), expected, `Stored binding ${expected} did not round-trip`);
}
for (const event of [
  { ...modifiers, code: "Escape", key: "Escape" },
  { ...modifiers, code: "ShiftLeft", key: "Shift", shiftKey: true },
  { ...modifiers, code: "KeyA", key: "Process", isComposing: true },
  { ...modifiers, code: "KeyA", key: "Dead" },
  { ...modifiers, code: "KeyA", key: "a", keyCode: 229 },
  { ...modifiers, code: "Unidentified", key: "a" },
]) assert.equal(bindingFromKeyboardEvent(event), null, `Ignored keyboard input was accepted: ${event.code}`);
assert.equal(bindingFromMouseEvent({ ...modifiers, button: 0 }), null);
assert.equal(bindingFromMouseEvent({ ...modifiers, button: 1 }), "Mouse3");
assert.equal(bindingFromMouseEvent({ ...modifiers, button: 2, shiftKey: true }), "Shift+Mouse2");
assert.equal(bindingFromMouseEvent({ ...modifiers, button: 3 }), "Mouse4");
assert.equal(bindingFromMouseEvent({ ...modifiers, button: 4 }), "Mouse5");
assert.equal(bindingFromWheelEvent({ ...modifiers, deltaY: -100, ctrlKey: true }), "Ctrl+WheelUp");
assert.equal(bindingFromWheelEvent({ ...modifiers, deltaY: 12 }), "WheelDown");
assert.equal(bindingFromWheelEvent({ ...modifiers, deltaY: 0 }), null);
assert.equal(actionBindingLabel("Ctrl+Shift+Num7"), "⌃+⇧+Num7");
assert.equal(actionBindingLabel("Alt+Mouse4"), "Alt+M4");
assert.equal(actionBindingLabel(""), "—");
assert.equal(isRiskyActionBinding("Ctrl+W"), true);
assert.equal(isRiskyActionBinding("Alt+ArrowLeft"), true);
assert.equal(isRiskyActionBinding("F5"), true);
assert.equal(isRiskyActionBinding("Ctrl+Shift+A"), false);

const migrated = validateActionBarSettings({
  slots: [
    { abilityId: "first", position: 25, key: "Shift+1" },
    { abilityId: "second", position: 1, key: "" },
  ],
  drill: "priority", duration: 60,
}, abilities, defaults);
assert.deepEqual(migrated.slots.map((slot) => slot.position), [1, 25], "Saved holes/positions were compacted");
assert.equal(migrated.bindings.length, ACTION_BAR_SLOT_COUNT);
assert.equal(migrated.bindings[25], "Shift+1", "Explicit legacy key lost to an earlier default empty slot");
assert.equal(migrated.bindings[12], "", "Conflicting default key should be cleared");
assert.equal(migrated.bindings[1], "", "Unbound occupied slot should stay unbound");
assert.equal(migrated.slots.find((slot) => slot.position === 25)?.key, "Shift+1");
assert.equal(migrated.slots.find((slot) => slot.position === 1)?.key, "");

const persisted = validateActionBarSettings(JSON.parse(JSON.stringify(migrated)), abilities, defaults);
assert.deepEqual(persisted.slots, migrated.slots, "Reload changed positions or mirrored slot keys");
assert.deepEqual(persisted.bindings, migrated.bindings, "Reload changed empty-slot bindings");

const assigned = assignActionBarBinding(persisted, 0, "Shift+1");
assert.equal(assigned.bindings[0], "Shift+1");
assert.equal(assigned.bindings[25], "", "Reassignment must clear the old binding even if that slot is occupied");
assert.equal(assigned.slots.find((slot) => slot.position === 25)?.key, "");
assert.equal(assigned.slots.find((slot) => slot.position === 0), undefined);
assert.equal(assignActionBarBinding(assigned, 99, "A"), assigned);
assert.equal(assignActionBarBinding(assigned, 0, "unsupported"), assigned);
assert.equal(assignActionBarBinding(assigned, 0, "").bindings[0], "");

const bindingsOnly = validateActionBarSettings({
  slots: [{ abilityId: "first", position: 20, key: "1" }],
  bindings: Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, position) => position === 0 ? "" : position === 33 ? "Ctrl+Alt+F12" : ACTION_BAR_KEYS[position]),
}, abilities, defaults);
assert.equal(bindingsOnly.bindings[0], "", "Explicitly unbound empty slot was reset");
assert.equal(bindingsOnly.bindings[33], "Ctrl+Alt+F12", "Binding on empty slot was dropped");
assert.equal(bindingsOnly.slots[0].position, 20);
assert.equal(bindingsOnly.slots[0].key, bindingsOnly.bindings[20]);
assert.deepEqual(actionBarBindings(bindingsOnly), bindingsOnly.bindings);

const duplicate = validateActionBarSettings({
  slots: [
    { abilityId: "first", position: 8, key: "Ctrl+Shift+A" },
    { abilityId: "second", position: 3, key: "Shift+Ctrl+KeyA" },
    { abilityId: "third", position: 3, key: "F25" },
    { abilityId: "third", position: 4, key: "F1" },
    { abilityId: "fourth", position: 36, key: "F2" },
  ],
}, abilities, defaults);
assert.equal(duplicate.bindings[3], "Ctrl+Shift+A");
assert.equal(duplicate.bindings[8], "", "Later duplicate binding was not cleared");
assert.equal(new Set(duplicate.slots.map((slot) => slot.abilityId)).size, duplicate.slots.length);
assert.equal(new Set(duplicate.slots.map((slot) => slot.position)).size, duplicate.slots.length);
assert(duplicate.slots.every((slot) => slot.position >= 0 && slot.position < ACTION_BAR_SLOT_COUNT));

const malformed = validateActionBarSettings({ slots: { unexpected: true }, bindings: "not-an-array", duration: "60" }, abilities, defaults);
assert.equal(malformed.slots.length, 1, "Malformed slots should fall back to defaults");
assert.equal(malformed.bindings.length, ACTION_BAR_SLOT_COUNT);
assert.equal(malformed.duration, 30);
assert.equal(new Set(malformed.bindings.filter(Boolean)).size, malformed.bindings.filter(Boolean).length, "Bindings must be globally unique");

console.log(JSON.stringify({ status: "passed", physicalKeyboard: true, mouseWheel: true, fixedPositions: true, migration: true, uniqueness: true, slots: ACTION_BAR_SLOT_COUNT }));
