import assert from "node:assert/strict";
import { shouldTurnBook, isBookPagePath, bookLocale, isCharacterAuthRedirect } from "../components/motion/routeTransitionPolicy.ts";
import { createBookRouteLifecycle, BOOK_ROUTE_TIMING as timing } from "../components/motion/bookRouteLifecycle.ts";

const profile = "/wow/characters/eu--eversong--%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F";
for (const path of [profile, `/ru${profile}`, "/", "/ru", "/wow/characters", "/talents/warrior/fury", "/privacy"]) {
  assert.equal(isBookPagePath(path), true);
  assert.equal(shouldTurnBook(path, path), false, "A filter or hash update must not turn a page");
  assert.equal(shouldTurnBook(path, `${path}/`), false, "Trailing slash redirects are not a new page");
}
assert.equal(shouldTurnBook("/wow/characters", profile), true);
assert.equal(shouldTurnBook(profile, `/ru${profile}`), true);
assert.equal(bookLocale(`/ru${profile}`), "ru");
assert.equal(bookLocale(profile), "en");
assert.equal(isCharacterAuthRedirect(profile, "/login"), true);
assert.equal(isCharacterAuthRedirect(`/ru${profile}`, "/ru/login"), true);
assert.equal(isCharacterAuthRedirect(`/ru${profile}`, "/ru/wow/characters"), false);
assert.equal(isCharacterAuthRedirect("/ru/wow/characters", "/ru/login"), false);
for (const path of ["/api/auth/signin", "/api/wow/export", "/v1/items", "/assets/book.png", "/export.csv", "/_next/static/app.js"]) assert.equal(isBookPagePath(path), false);

function harness() {
  let time = 0, handle = 0;
  const tasks = new Map();
  const lifecycle = createBookRouteLifecycle(() => {}, {
    now: () => time,
    schedule: (callback, delay) => { const id = ++handle; tasks.set(id, { callback, at: time + delay }); return id; },
    cancel: (id) => tasks.delete(id),
  });
  return { lifecycle, tasks, advance(ms) {
    const end = time + ms;
    let next;
    while ((next = [...tasks.entries()].sort((a, b) => a[1].at - b[1].at).find(([, t]) => t.at <= end))) {
      tasks.delete(next[0]); time = next[1].at; next[1].callback();
    }
    time = end;
  } };
}
const first = harness();
const opening = first.lifecycle.start("open");
first.advance(2000);
assert.equal(first.lifecycle.state.phase, "waiting", "Slow data must keep the book closed");
first.lifecycle.ready(opening);
first.advance(0);
assert.equal(first.lifecycle.state.phase, "playing");
first.advance(timing.open);
assert.equal(first.lifecycle.state.phase, "idle");
assert.equal(first.tasks.size, 0);

const nav = harness();
const turn = nav.lifecycle.start("turn");
nav.lifecycle.ready(turn);
nav.lifecycle.ready(turn); // Observer notifications must not schedule duplicate completions.
nav.advance(timing.lift - 1);
assert.equal(nav.lifecycle.state.phase, "waiting");
nav.advance(1);
assert.equal(nav.lifecycle.state.phase, "playing");
const nextTurn = nav.lifecycle.start("turn");
nav.lifecycle.ready(turn);
nav.advance(timing.turn + timing.lift);
assert.equal(nav.lifecycle.state.phase, "waiting", "Old ready callbacks and timers must not finish the next route");
nav.lifecycle.ready(nextTurn);
nav.advance(timing.turn);
assert.equal(nav.lifecycle.state.phase, "idle");
assert.equal(nav.tasks.size, 0);

for (const kind of ["open", "turn"]) {
  const reduced = harness();
  reduced.lifecycle.start(kind, true);
  assert.equal(reduced.lifecycle.state.phase, "idle");
  assert.equal(reduced.tasks.size, 0);
  const interrupted = harness();
  const id = interrupted.lifecycle.start(kind);
  interrupted.lifecycle.finish();
  interrupted.lifecycle.ready(id);
  interrupted.advance(timing.watchdog);
  assert.equal(interrupted.lifecycle.state.phase, "idle");
  assert.equal(interrupted.tasks.size, 0);
  const timeout = harness();
  timeout.lifecycle.start(kind);
  timeout.advance(timing.watchdog);
  assert.equal(timeout.lifecycle.state.phase, "idle", "Failed or cancelled navigation must never trap the page");
  assert.equal(timeout.tasks.size, 0);
  const strict = harness();
  const stale = strict.lifecycle.start(kind);
  strict.lifecycle.cancel();
  const current = strict.lifecycle.start(kind);
  strict.lifecycle.ready(stale);
  assert.equal(strict.lifecycle.state.phase, "waiting");
  strict.lifecycle.ready(current);
  strict.advance(timing.lift + timing[kind]);
  assert.equal(strict.lifecycle.state.phase, "idle");
  assert.equal(strict.tasks.size, 0);
}
console.log("Shared book navigation: opening, page turns, real readiness, rapid navigation, stale callbacks, reduced motion, cancellation and watchdog passed.");
