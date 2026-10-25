import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHubTimer, hubTimerPercent, hubTimerCopy } from '../../components/wow/mythic/mythicHubTimers.ts';
import { dungeonRoutes, dungeonSlugs } from '../../lib/data/wow/mythic/dungeonRoutes.ts';

test('key durations retain minutes and two-digit seconds without decimal or clock coercion', () => {
  for (const [seconds, expected] of [[0,'00:00'],[5,'00:05'],[59,'00:59'],[60,'01:00'],[65,'01:05'],[1680,'28:00'],[1799,'29:59'],[6000,'100:00']]) {
    assert.equal(formatHubTimer(seconds), expected);
  }
});

test('invalid durations never print NaN, negative values, or fractional seconds', () => {
  for (const seconds of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(formatHubTimer(seconds), '—');
  }
});

test('comparison widths share one zero-based scale, and malformed widths remain contained', () => {
  assert.equal(hubTimerPercent(1680, 2040), 1680 / 2040 * 100);
  assert.equal(hubTimerPercent(2040, 2040), 100);
  assert.equal(hubTimerPercent(4000, 2040), 100);
  assert.equal(hubTimerPercent(-2, 2040), 0);
  assert.equal(hubTimerPercent(30, 0), 0);
  assert.equal(hubTimerPercent(NaN, 2040), 0);
  assert.equal(hubTimerPercent(30, Infinity), 0);
});

test('all eight hub durations use the same valid limits as their detail pages', () => {
  const before = JSON.stringify(dungeonSlugs);
  const sorted = [...dungeonSlugs].sort((a,b) => dungeonRoutes[a].timerSeconds - dungeonRoutes[b].timerSeconds);
  assert.equal(new Set(sorted).size, 8);
  for (let index = 0; index < sorted.length; index++) {
    const seconds = dungeonRoutes[sorted[index]].timerSeconds;
    assert.match(formatHubTimer(seconds), /^\d{2,}:\d{2}$/);
    assert(seconds > 0);
    if (index) assert(seconds >= dungeonRoutes[sorted[index-1]].timerSeconds);
    for (const locale of ['ru', 'en']) assert(hubTimerCopy[locale].duration(seconds).includes(String(Math.floor(seconds/60))));
  }
  assert.equal(JSON.stringify(dungeonSlugs), before);
});
