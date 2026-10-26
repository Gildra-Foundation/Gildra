import assert from "node:assert/strict";
import test from "node:test";
import { backgroundKey, mapBackground, readMapPreference, saveMapPreference, sketchPoints, subscribeMapPreferences } from "../../components/wow/raid/raidMapPreferences";

test("invalid or unbounded saved paths cannot add off-map markers", () => {
  assert.deepEqual(sketchPoints("not json"), []);
  assert.deepEqual(sketchPoints('{"x":2}'), []);
  assert.deepEqual(sketchPoints('[null,{"x":-1,"y":5},{"x":20,"y":101},{"x":"2","y":3},{"x":0,"y":100}]'), [{ x: 0, y: 100 }]);
  assert.equal(sketchPoints(JSON.stringify(Array.from({ length: 100 }, () => ({ x: 50, y: 50 })))).length, 40);
  assert.equal(mapBackground("injected-mode"), "map");
});

test("blocked writes override an existing preference and external storage changes resume synchronization", () => {
  const events = new EventTarget();
  const values = new Map([[backgroundKey, "map"]]);
  let failWrite = true;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrite) throw new Error("quota"); values.set(key, value); } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
  } });
  let changes = 0;
  const unsubscribe = subscribeMapPreferences(() => changes++);
  try {
    saveMapPreference(backgroundKey, "arena");
    assert.equal(readMapPreference(backgroundKey), "arena");
    assert.equal(values.get(backgroundKey), "map");
    failWrite = false;
    saveMapPreference(backgroundKey, "grid");
    assert.equal(readMapPreference(backgroundKey), "grid");
    values.set(backgroundKey, "art");
    const storage = new Event("storage"); Object.defineProperty(storage, "key", { value: backgroundKey }); events.dispatchEvent(storage);
    assert.equal(readMapPreference(backgroundKey), "art");
    assert.equal(changes, 3);
  } finally {
    unsubscribe();
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  }
});
