import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { localeArrivalScript } from "../../components/platform/locale/localeArrivalScript.ts";
import { LOCALE_SWITCH_ID, LOCALE_SWITCH_KEY, localeBarePath, localeSwitchTarget, readingAnchor } from "../../components/platform/locale/localeSwitch.ts";

const url = (path: string) => new URL(path, "https://gildra.net");

describe("locale switch", () => {
  it("recognises only a change of the /ru prefix on the same page", () => {
    assert.equal(localeSwitchTarget(url("/wow/raids"), url("/ru/wow/raids")), "ru");
    assert.equal(localeSwitchTarget(url("/ru"), url("/")), "en");
    assert.equal(localeSwitchTarget(url("/ru/tier-lists/"), url("/tier-lists?role=dps")), "en");
    assert.equal(localeSwitchTarget(url("/wow/raids"), url("/ru/wow/lairs")), null, "another page");
    assert.equal(localeSwitchTarget(url("/wow/raids"), url("/wow/raids")), null, "same language");
    assert.equal(localeSwitchTarget(url("/russia"), url("/ru/russia")), "ru", "/russia is not the Russian prefix");
    assert.equal(localeSwitchTarget(url("/wow"), new URL("https://example.com/ru/wow")), null, "another origin");
    assert.equal(localeBarePath("/ru/"), "/");
  });

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
function arrive({ path, from, record, viewTransitions = true, reduced = false }: { path: string; from?: string; record?: object; viewTransitions?: boolean; reduced?: boolean }) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const head: { rel: string; href: string; blocking?: string }[] = [];
  const storage = new Map(record ? [[LOCALE_SWITCH_KEY, JSON.stringify(record)]] : []);
  const scrolls: number[] = [];
  const replaced: string[] = [];
  const target = { tagName: "SECTION", children: [], isConnected: true, getBoundingClientRect: () => ({ top: 1500 - window.scrollY }) };
  const content = { children: [target] };
  const location = { href: `https://gildra.net${path}`, pathname: path.split(/[?#]/)[0], search: "" };
  const window: Record<string, unknown> & { scrollY: number } = {
    scrollY: 0,
    location,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) },
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; },
    scrollTo: (options: { top: number }) => { window.scrollY = options.top; scrolls.push(options.top); },
    requestAnimationFrame: () => 0,
    history: { state: null, replaceState: (_state: unknown, _title: string, next: string) => replaced.push(next) },
    navigation: from ? { activation: { from: { url: `https://gildra.net${from}` }, entry: { url: location.href } } } : undefined,
    document: {
      documentElement: { dataset: {} as Record<string, string> },
      referrer: "",
      head: { appendChild: (link: { rel: string; href: string; attributes: Record<string, string> }) => head.push({ rel: link.rel, href: link.href, blocking: link.attributes.blocking }) },
      createElement: () => ({ rel: "", href: "", attributes: {} as Record<string, string>, setAttribute(name: string, value: string) { this.attributes[name] = value; } }),
      getElementById: (id: string) => (id === "atlas-content" ? content : null),
      addEventListener: () => {},
    },
    URL,
    Date,
    JSON,
    Math,
    setTimeout,
  };
  if (viewTransitions) Object.assign(window, { onpagereveal: null, CSSViewTransitionRule: function CSSViewTransitionRule() {} });
  window.window = window;
  vm.runInNewContext(localeArrivalScript, window);
  const transition = () => {
    const state = { skipped: false };
    return { state, viewTransition: { skipTransition: () => { state.skipped = true; }, finished: { finally: () => {} } } };
  };
  return { listeners, head, scrolls, replaced, storage, dataset: (window.document as { documentElement: { dataset: Record<string, string> } }).documentElement.dataset, transition };
}

describe("locale arrival script", () => {
  it("holds the first paint until the toolbar is parsed, restores the anchor and keeps the transition", () => {
    const record = { to: "/ru/wow/raids", at: Date.now(), y: 900, path: [[0, "SECTION"]], top: 80, hash: "#timers" };
    const page = arrive({ path: "/ru/wow/raids", from: "/wow/raids", record });
    assert.deepEqual(page.head, [{ rel: "expect", href: `#${LOCALE_SWITCH_ID}`, blocking: "render" }]);
    assert.equal(page.storage.size, 0, "the record is used once");
    const { state, viewTransition } = page.transition();
    page.listeners.pagereveal({ viewTransition });
    assert.equal(state.skipped, false);
    assert.equal(page.dataset.localeSwitch, "ru");
    assert.deepEqual(page.scrolls, [1420], "the anchored section sits 80 px below the viewport top again");
    assert.deepEqual(page.replaced, ["/ru/wow/raids#timers"]);
  });

  it("skips the transition for other full loads and for less motion", () => {
    const other = arrive({ path: "/ru/wow/raids", from: "/ru/wow/lairs" });
    assert.deepEqual(other.head, [], "no render blocking outside a language switch");
    const skipped = other.transition();
    other.listeners.pagereveal({ viewTransition: skipped.viewTransition });
    assert.equal(skipped.state.skipped, true);

    const still = arrive({ path: "/wow/raids", from: "/ru/wow/raids", reduced: true });
    const stilled = still.transition();
    still.listeners.pagereveal({ viewTransition: stilled.viewTransition });
    assert.equal(stilled.state.skipped, true);
  });

  it("names the target language when the old page swaps out, and skips other navigations", () => {
    const page = arrive({ path: "/wow/raids" });
    const swap = page.transition();
    page.listeners.pageswap({ viewTransition: swap.viewTransition, activation: { entry: { url: "https://gildra.net/ru/wow/raids" } } });
    assert.equal(swap.state.skipped, false);
    assert.equal(page.dataset.localeSwitch, "ru");
    const away = page.transition();
    page.listeners.pageswap({ viewTransition: away.viewTransition, activation: { entry: { url: "https://gildra.net/wow/lairs" } } });
    assert.equal(away.state.skipped, true);
  });

  it("ignores a stale or foreign record and falls back to a fade without view transitions", () => {
    const stale = arrive({ path: "/ru/wow/raids", record: { to: "/ru/wow/raids", at: Date.now() - 60000, y: 900, path: [], top: 0, hash: "" } });
    assert.deepEqual(stale.head, []);
    const fallback = arrive({ path: "/ru/wow/raids", viewTransitions: false, record: { to: "/ru/wow/raids", at: Date.now(), y: 900, path: [], top: 0, hash: "" } });
    assert.equal(fallback.dataset.localeFallback, "");
    assert.equal(fallback.listeners.pagereveal, undefined);
  });
});
