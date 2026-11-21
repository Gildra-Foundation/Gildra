import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const requireDriver = createRequire(join(process.env.RUNNER_TEMP, 'driver', 'driver.cjs'));
const { chromium } = requireDriver('playwright-core');
const mode = process.argv[2];
const origin = 'https://wowarcana.com';
const slug = 'eu--synthetic--gildrareleasesmoke';
const character = {
  id: 42, name: 'GildraReleaseSmoke', level: 90, realm: { id: 1, slug: 'synthetic', name: 'Synthetic' },
  region: 'eu', playableClass: { id: 1 }, playableRace: { id: 3 }, faction: { type: 'ALLIANCE' }, accountId: 5
};
const fixture = JSON.parse(await readFile(new URL('fury-profile.json', import.meta.url), 'utf8'));
const armory = { ...fixture.armory, activeSpecializationId: 72, activeTalentLoadout: fixture.talentLoadout };
Object.assign(armory.profile, { id: character.id, equipped_item_level: 270 });
armory.equipment.character = { id: character.id, realm: { id: 1 } };
for (const row of armory.equipment.equipped_items) Object.assign(row, { name: 'Fixture ' + row.slot.type, level: { value: 270 } });
const market = { id: 'smoke-market', region: 'eu', connectedRealmId: 1, sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers: [] };
const owner = '3'.repeat(64);
let browser;
for (let i = 0; i < 75 && !browser; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:19222', {timeout: 2000}); }
  catch { await delay(800); }
}
assert.ok(browser, 'No WebView2 debugging endpoint');
const context = browser.contexts()[0];
const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 30000 });
let session = false, hosted = 0;
const reads = new Set();
await page.route(origin + '/**', async route => {
  const u = new URL(route.request().url()), query = u.searchParams;
  const kind = query.get('read');
  if (u.pathname === '/api/wow/gear-desktop-data') {
    reads.add(kind);
    if (!session || (query.has('owner') && query.get('owner') !== owner)) return route.fulfill({ status: 401, json: { error: 'session_expired' } });
    const value = { session: {protocol: 1, owner}, character, snapshot: armory, market, equipment: armory.equipment, icon: {assets: []}, prices: {prices: {}, sourceUpdatedAt: market.sourceUpdatedAt} }[kind];
    return route.fulfill({ status: value ? 200 : 404, json: value ?? {} });
  }
  if (u.pathname.startsWith('/api/wow/')) {
    hosted++;
    return route.fulfill({ status: 200, json: { hosted: true } });
  }
  return route.fulfill({ contentType: 'text/html', body: '<html lang="en"><main><div data-character-identity><h1>Test character</h1></div><div data-tool-panel="upgrades" style="min-height:10px"></div></main></html>' });
});
async function send(path, method = 'GET', body) {
  return page.evaluate(async args => {
    const response = await fetch(args.path, {method: args.method, body: args.body && JSON.stringify(args.body)});
    return [response.status, await response.json()];
  }, {path, method, body});
}
async function waitJob(path) {
  for (let i = 0; i < 140; i++) {
    const [status, job] = await send(path);
    assert.equal(status, 200, JSON.stringify(job));
    if (job.status === 'completed') return job.result;
    assert.ok(['queued', 'running'].includes(job.status), JSON.stringify({status: job.status, error: job.error, progress: job.progress}));
    await delay(700);
  }
  throw Error('Calculation timed out');
}
try {
  // Navigate only after the native shell has completed its first navigation and installed its bridge.
  await page.waitForURL(origin + '/**', {waitUntil:'commit', timeout:60000});
  await page.goto(origin + '/ru/wow/characters/' + slug + '#upgrades');
  const auction = '/api/wow/auction-gear-plans';
  if (mode === 'server') {
    assert.deepEqual(await send(auction + '?active=1'), [200, {hosted: true}]);
    assert.equal(hosted, 1);
    console.log('Server mode sent the calculation request to the site.');
  } else {
    assert.equal((await send(auction + '?active=1'))[0], 401);
    session = true;
    let [status, job] = await send(auction, 'POST', {characterSlug: slug, scenario: 'single-target', fightLengthSeconds: 30, locale: 'en', budgetGold: '1000', selectedSlots: ['HEAD']});
    assert.equal(status, 202, JSON.stringify(job));
    const result = await waitJob(auction + '?id=' + job.id);
    assert.ok(result.baseline?.dps > 0, JSON.stringify(result.baseline));
    assert.match(result.baseline.engine, /18428cd/);
    const farm = '/api/wow/gear-farm-plans';
    const scope = {characterSlug: slug, profileKey: 'windows-test', locale:'ru', dungeonDifficulty:'heroic', raidDifficulty:'heroic'};
    [status, job] = await send(farm, 'POST', {...scope, clientRequestId: Date.now() + ':' + randomUUID()});
    assert.equal(status, 202, JSON.stringify(job));
    const farmResult = await waitJob(farm + '?' + new URLSearchParams({...scope, id:job.id}));
    assert.equal(farmResult.character.specId, 72);
    assert.ok(farmResult.activities.length);
    assert.equal((await send('/api/wow/auction-shopping-list','POST',{searchId:'missing',recommendationKey:'missing',purchasedKeys:[]}))[0],404);
    assert.equal(hosted, 0);
    for (const kind of ['session','snapshot','market']) assert.ok(reads.has(kind), kind);
    await page.evaluate(dps => {
      const panel = document.querySelector('[data-tool-panel]');
      panel.innerHTML = '<article data-auction-assembly-result><h4 data-auction-primary-title>Windows smoke set</h4><div data-auction-primary-dps></div></article>';
      panel.querySelector('[data-auction-primary-dps]').textContent = dps + ' DPS';
    }, Math.round(result.baseline.dps));
    console.log(JSON.stringify({local: result.baseline, farmActivities: farmResult.activities.length, hosted}));
  }
} finally { await browser.close(); }
