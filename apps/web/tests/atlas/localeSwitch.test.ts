import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { localeArrivalScript } from "../../components/platform/locale/localeArrivalScript.ts";
import { LOCALE_SWITCH_KEY, readingAnchor } from "../../components/platform/locale/localeSwitch.ts";

const url = (path: string) => new URL(path, "https://wowarcana.com");

describe("locale switch", () => {
  it("anchors the reading line on the deepest in-flow element, skipping artwork layers", () => {
    const node = (top: number, height: number, children: unknown[] = [], tagName = "DIV", position = "static") =>
      ({ tagName, children, position, getAttribute: () => null, getBoundingClientRect: () => ({ top, bottom: top + height, height }) });
    const row = node(40, 40, [], "TR");
    const table = node(-200, 600, [node(-200, 20, [], "THEAD"), node(-180, 580, [node(-180, 40, [], "TR"), node(0, 40, [], "TR"), row], "TBODY")], "TABLE");
    const art = node(-900, 3000, [], "IMG", "absolute");
    const root = node(-900, 3000, [art, node(-900, 700, [], "HEADER"), table]);
    const original = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((element: { position: string }) => ({ position: element.position })) as unknown as typeof getComputedStyle;
    try {
      const anchor = readingAnchor(root as unknown as Element, 64);
      assert.deepEqual(anchor.path, [[2, "TABLE"], [1, "TBODY"], [2, "TR"]]);
      assert.equal(anchor.top, -24, "offset of that row from the reading line");
    } finally {
      globalThis.getComputedStyle = original;
    }
  });
});

/** Runs the inline head script against a minimal browser and returns its listeners and effects. */
function arrive({ path, record, pageReveal = true, reduced = false, streaming = false }: { path: string; record?: object; pageReveal?: boolean; reduced?: boolean; streaming?: boolean }) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const documentListeners: Record<string, (event: unknown) => void> = {};
  const storage = new Map(record ? [[LOCALE_SWITCH_KEY, JSON.stringify(record)]] : []);
  const scrolls: number[] = [];
  const replaced: string[] = [];
  const target = { tagName: "SECTION", children: [], isConnected: true, getBoundingClientRect: () => ({ top: 1500 - window.scrollY }) };
  const content = { children: [target] };
  const parsing = { streaming };
  const location = { href: `https://wowarcana.com${path}`, pathname: path.split(/[?#]/)[0], search: "" };
  const window: Record<string, unknown> & { scrollY: number } = {
    scrollY: 0,
    location,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) },
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; },
    scrollTo: (options: { top: number }) => { window.scrollY = options.top; scrolls.push(options.top); },
    requestAnimationFrame: () => 0,
    history: { state: null, replaceState: (_state: unknown, _title: string, next: string) => replaced.push(next) },
    document: {
      documentElement: { dataset: {} as Record<string, string> },
      referrer: "",
      readyState: streaming ? "loading" : "interactive",
      getElementById: (id: string) => (id === "atlas-content" && !parsing.streaming ? content : null),
      addEventListener: (name: string, listener: (event: unknown) => void) => { documentListeners[name] = listener; },
    },
    URL,
    Date,
    JSON,
    Math,
    setTimeout: (callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); timer.unref?.(); return timer; },
    clearTimeout,
  };
  if (pageReveal) Object.assign(window, { onpagereveal: null });
  window.window = window;
  vm.runInNewContext(localeArrivalScript, window);
  const ready = () => { parsing.streaming = false; (window.document as { readyState: string }).readyState = "interactive"; };
  return { listeners, documentListeners, scrolls, replaced, storage, ready, dataset: (window.document as { documentElement: { dataset: Record<string, string> } }).documentElement.dataset };
}

describe("locale arrival script", () => {
  it("keeps the arriving content unpainted until it is anchored, then resolves it", () => {
    const record = { to: "/ru/wow/raids", at: Date.now(), y: 900, path: [[0, "SECTION"]], top: 80, hash: "#timers" };
    const page = arrive({ path: "/ru/wow/raids", record });
    assert.equal(page.storage.size, 0, "the record is used once");
    assert.equal(page.dataset.localeArrival, "hold", "hidden before the first paint");
    page.listeners.pagereveal({});
    assert.deepEqual(page.scrolls, [1420], "the anchored section sits 80 px below the viewport top again");
    assert.deepEqual(page.replaced, ["/ru/wow/raids#timers"]);
    assert.equal(page.dataset.localeArrival, "4", "nothing left to settle: shown at once, resolving");
  });

  it("leaves other full loads alone; less motion is anchored too, then fades shortly", () => {
    const other = arrive({ path: "/ru/wow/raids" });
    assert.equal(other.dataset.localeArrival, undefined);
    assert.equal(other.listeners.pagereveal, undefined, "no switch, nothing to restore");

    const still = arrive({ path: "/wow/raids", reduced: true, record: { to: "/wow/raids", at: Date.now(), y: 900, path: [], top: 0, hash: "" } });
    assert.equal(still.dataset.localeArrival, "hold");
    still.listeners.pagereveal({});
    assert.equal(still.dataset.localeArrival, "still", "less motion: a plain short fade");
    assert.deepEqual(still.scrolls, [900, 900], "the position is restored, and again once settled");
  });

  it("waits for the content when the first frame comes before it", () => {
    const record = { to: "/ru/wow/raids", at: Date.now(), y: 900, path: [[0, "SECTION"]], top: 80, hash: "" };
    const page = arrive({ path: "/ru/wow/raids", record, streaming: true });
    page.listeners.pagereveal({});
    assert.equal(page.dataset.localeArrival, "hold", "still hidden");
    assert.deepEqual(page.scrolls, [], "no guess at the position before the content exists");
    assert.ok(page.documentListeners.DOMContentLoaded, "the position is restored once the content is parsed");
    page.ready();
    page.documentListeners.DOMContentLoaded({});
    assert.deepEqual(page.scrolls, [1420], "the anchor is back in place");
    assert.equal(page.dataset.localeArrival, "4", "and only then the content is shown");
  });

  it("ignores a stale record and restores on DOMContentLoaded without pagereveal", () => {
    const stale = arrive({ path: "/ru/wow/raids", record: { to: "/ru/wow/raids", at: Date.now() - 60000, y: 900, path: [], top: 0, hash: "" } });
    assert.equal(stale.dataset.localeArrival, undefined);
    const older = arrive({ path: "/ru/wow/raids", pageReveal: false, record: { to: "/ru/wow/raids", at: Date.now(), y: 900, path: [], top: 0, hash: "" } });
    assert.equal(older.listeners.pagereveal, undefined);
    assert.equal(older.dataset.localeArrival, "hold");
    older.documentListeners.DOMContentLoaded({});
    assert.deepEqual(older.scrolls, [900, 900]);
    assert.equal(older.dataset.localeArrival, "4");
  });
});
