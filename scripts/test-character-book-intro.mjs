import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createCharacterBookIntroLifecycle,
  CHARACTER_BOOK_INTRO_TIMING as timing,
} from "../components/wow/audit/characterBookIntroLifecycle.ts";

function harness() {
  let now = 0;
  let id = 0;
  const tasks = new Map();
  const states = [];
  const lifecycle = createCharacterBookIntroLifecycle({
    onChange: (state) => {
      assert.deepEqual(Object.keys(state).sort(), ["failure", "phase", "playId"]);
      assert.ok(["idle", "preparing", "opening", "done"].includes(state.phase), "The book must never enter a duel phase");
      states.push(state);
    },
    schedule: (callback, delay) => {
      const handle = ++id;
      tasks.set(handle, { callback, at: now + delay });
      return handle;
    },
    cancelTimer: (handle) => tasks.delete(handle),
  });
  return {
    lifecycle, states, tasks,
    get current() { return states.at(-1); },
    start(overrides = {}) { lifecycle.start({ enabled: true, reducedMotion: false, ...overrides }); },
    advance(ms) {
      const end = now + ms;
      let task;
      while ((task = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at).find(([, item]) => item.at <= end))) {
        tasks.delete(task[0]);
        now = task[1].at;
        task[1].callback();
      }
      now = end;
    },
  };
}

assert.deepEqual(timing, { prepare: 2_000, opening: 1_400, watchdog: 4_000 });
assert.ok(timing.watchdog > timing.prepare + timing.opening, "The watchdog must allow a late cover decode to finish opening");

// Cover readiness opens the book directly: no duel, replay click or session flag.
const normal = harness();
normal.start();
assert.equal(normal.current.phase, "preparing");
assert.equal(normal.current.failure, null);
normal.lifecycle.assetsReady(normal.current.playId);
assert.equal(normal.current.phase, "opening");
normal.advance(timing.opening - 1);
assert.equal(normal.current.phase, "opening");
normal.advance(1);
assert.equal(normal.current.phase, "done");
assert.equal(normal.current.failure, null);
assert.deepEqual(normal.states.map((state) => state.phase), ["preparing", "opening", "done"]);
assert.equal(normal.tasks.size, 0, "Successful opening leaked a timer");

// Every successful profile mount starts automatically, even after completion.
for (let run = 0; run < 3; run += 1) {
  const previousId = normal.current.playId;
  normal.start();
  assert.equal(normal.current.phase, "preparing");
  assert.ok(normal.current.playId > previousId);
  normal.lifecycle.assetsReady(normal.current.playId);
  assert.equal(normal.current.phase, "opening");
  normal.advance(timing.opening);
  assert.equal(normal.current.phase, "done");
  assert.equal(normal.tasks.size, 0);
}

// Slow cover decode cannot spend the opening animation before it is visible.
const delayed = harness();
delayed.start();
delayed.advance(1_500);
assert.equal(delayed.current.phase, "preparing");
delayed.lifecycle.assetsReady(delayed.current.playId);
assert.equal(delayed.current.phase, "opening");
delayed.advance(timing.opening - 1);
assert.equal(delayed.current.phase, "opening");
delayed.advance(1);
assert.equal(delayed.current.phase, "done");
assert.equal(delayed.current.failure, null);
assert.equal(delayed.tasks.size, 0);

for (const policy of [{ enabled: false }, { reducedMotion: true }, { enabled: false, reducedMotion: true }]) {
  const test = harness();
  test.start(policy);
  assert.equal(test.current.phase, "done");
  assert.equal(test.current.failure, null);
  assert.equal(test.tasks.size, 0);
  test.lifecycle.assetsReady(test.current.playId);
  test.lifecycle.assetsFailed(test.current.playId);
  assert.equal(test.current.phase, "done");
}

// A failed/timed-out cover leaves the real page usable and the next mount free.
for (const reason of ["assets", "timeout"]) {
  const test = harness();
  test.start();
  const failedId = test.current.playId;
  if (reason === "assets") test.lifecycle.assetsFailed(failedId);
  else test.advance(timing.prepare);
  assert.equal(test.current.phase, "done");
  assert.equal(test.current.failure, reason);
  assert.equal(test.tasks.size, 0);
  test.lifecycle.assetsReady(failedId);
  test.lifecycle.assetsFailed(failedId);
  test.lifecycle.finish(failedId);
  assert.equal(test.current.failure, reason, "A late callback erased the failure outcome");
  test.start();
  assert.equal(test.current.phase, "preparing");
  assert.equal(test.current.failure, null);
  test.lifecycle.assetsReady(test.current.playId);
  test.advance(timing.opening);
  assert.equal(test.current.phase, "done");
  assert.equal(test.current.failure, null);
  assert.equal(test.tasks.size, 0);
}

// Duplicate decode notifications and late failures must not restart opening.
const duplicate = harness();
duplicate.start();
duplicate.lifecycle.assetsReady(duplicate.current.playId);
duplicate.advance(700);
const publishedBeforeDuplicates = duplicate.states.length;
duplicate.lifecycle.assetsReady(duplicate.current.playId);
duplicate.lifecycle.assetsFailed(duplicate.current.playId);
assert.equal(duplicate.states.length, publishedBeforeDuplicates);
duplicate.advance(timing.opening - 700);
assert.equal(duplicate.current.phase, "done");
assert.equal(duplicate.current.failure, null);
assert.equal(duplicate.tasks.size, 0);

// Skip/Escape and visibility/reduced-motion interruption release both phases.
for (const phase of ["preparing", "opening"]) {
  for (const action of ["finish", "interrupt"]) {
    const test = harness();
    test.start();
    const playId = test.current.playId;
    if (phase === "opening") test.lifecycle.assetsReady(playId);
    test.lifecycle[action](playId);
    assert.equal(test.current.phase, "done");
    assert.equal(test.current.failure, null);
    assert.equal(test.tasks.size, 0);
    const publishedAfterStop = test.states.length;
    test.lifecycle.assetsReady(playId);
    test.lifecycle.assetsFailed(playId);
    test.lifecycle.finish(playId);
    test.lifecycle.interrupt();
    test.advance(timing.watchdog * 2);
    assert.equal(test.states.length, publishedAfterStop, "Stopped animation unexpectedly resumed");
  }
}

// Character changes cannot be completed/failed by the previous page's work.
const replaced = harness();
replaced.start();
const oldId = replaced.current.playId;
const oldCallbacks = [...replaced.tasks.values()].map((task) => task.callback);
replaced.start();
assert.ok(replaced.current.playId > oldId);
replaced.lifecycle.assetsReady(oldId);
replaced.lifecycle.assetsFailed(oldId);
replaced.lifecycle.finish(oldId);
oldCallbacks.forEach((callback) => callback());
assert.equal(replaced.current.phase, "preparing");
assert.equal(replaced.current.failure, null);
replaced.lifecycle.assetsReady(replaced.current.playId);
replaced.advance(timing.opening);
assert.equal(replaced.current.phase, "done");
assert.equal(replaced.tasks.size, 0);

// React StrictMode setup -> cleanup -> setup invalidates asynchronous callbacks.
for (const phase of ["preparing", "opening"]) {
  const test = harness();
  test.start();
  const abandonedId = test.current.playId;
  if (phase === "opening") test.lifecycle.assetsReady(abandonedId);
  const abandonedCallbacks = [...test.tasks.values()].map((task) => task.callback);
  test.lifecycle.cancel();
  assert.equal(test.tasks.size, 0);
  const beforeUnmount = test.states.length;
  test.lifecycle.assetsReady(abandonedId);
  test.lifecycle.assetsFailed(abandonedId);
  test.lifecycle.finish(abandonedId);
  abandonedCallbacks.forEach((callback) => callback());
  assert.equal(test.states.length, beforeUnmount, "Cancelled instance notified an unmounted hook");
  test.start();
  assert.equal(test.current.phase, "preparing");
  assert.ok(test.current.playId > abandonedId);
  test.lifecycle.assetsReady(abandonedId);
  abandonedCallbacks.forEach((callback) => callback());
  assert.equal(test.current.phase, "preparing");
  test.lifecycle.assetsReady(test.current.playId);
  test.advance(timing.opening);
  assert.equal(test.current.phase, "done");
  assert.equal(test.tasks.size, 0);
}

// The watchdog fails open if the normal presentation deadline never executes.
const watchdog = harness();
watchdog.start();
watchdog.lifecycle.assetsReady(watchdog.current.playId);
for (const [handle, task] of watchdog.tasks) {
  if (task.at !== timing.watchdog) watchdog.tasks.delete(handle);
}
watchdog.advance(timing.watchdog);
assert.equal(watchdog.current.phase, "done");
assert.equal(watchdog.current.failure, "timeout");
assert.equal(watchdog.tasks.size, 0);

// The last valid decode still gets the entire opening before the watchdog.
const boundary = harness();
boundary.start();
boundary.advance(timing.prepare - 1);
boundary.lifecycle.assetsReady(boundary.current.playId);
boundary.advance(timing.opening - 1);
assert.equal(boundary.current.phase, "opening");
boundary.advance(1);
assert.equal(boundary.current.phase, "done");
assert.equal(boundary.current.failure, null);
assert.equal(boundary.tasks.size, 0);

// Integration contract: the persistent route shell now owns the opening for all pages.
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const path of [
  "components/wow/audit/CharacterBookIntro.tsx",
  "components/wow/audit/useCharacterBookIntro.ts",
  "components/wow/characters/CharacterProfileLoading.tsx",
]) {
  const text = source(path);
  assert.doesNotMatch(text, /sessionStorage|CHARACTER_BOOK_INTRO_SESSION_KEY|seenWithoutStorage/, path + " must not suppress automatic opening using a session marker");
  assert.doesNotMatch(text, /data-book-intro-replay|\breplayRef\b|\bonClick=\{replay\}|Смотреть вступление|Watch opening/, path + " must not expose the removed replay button");
  assert.doesNotMatch(text, /\bCharacterBookDuel\b|\bCHARACTER_BOOK_DUEL_FRAMES\b|duel-sequence\/|arthas-strike|illidan-parry/, path + " must not render or preload the cancelled duel");
}
assert.doesNotMatch(source("components/wow/audit/CharacterAuditPage.tsx"), /<CharacterBookIntro\b/, "Profiles must not play a second opening after the shared page turn");
assert.match(source("components/motion/RouteTransition.tsx"), /<BookRouteScene\b/, "All routes must share the opening and page-turn scene");
assert.doesNotMatch(source("components/motion/RouteTransition.tsx"), /key=\{(?:pathname|routeKey)\}/, "Query changes must preserve live page state");
for (const prefix of ["app/wow", "app/ru/wow"]) {
  const route = source(prefix + "/characters/[slug]/page.tsx");
  assert.match(route, /getBattleNetCharacterDetails\(/, prefix + " no longer loads real character details");
  assert.match(route, /<CharacterAuditPage\b[^>]*dataMode="battle-net"/, prefix + " no longer renders the real character page");
  assert.match(source(prefix + "/characters/[slug]/loading.tsx"), /<CharacterProfileLoading\b/, prefix + " lost its actual route loading state");
}

console.log("Book opening lifecycle and real EN/RU profile integration: shared scene, no duplicate intro, real loading boundary, timer cleanup and preserved profile state passed.");
